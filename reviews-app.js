class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { console.error(error, errorInfo); }
  render() { if (this.state.hasError) return <div>Error</div>; return this.props.children; }
}

function StarRating({ rating, setRating, readOnly = false }) {
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(star => (
                <button 
                    key={star} 
                    type="button"
                    disabled={readOnly}
                    onClick={() => !readOnly && setRating(star)}
                    className={`transition-all ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
                >
                    <div className={`icon-star text-lg ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}></div>
                </button>
            ))}
        </div>
    );
}

function ReviewsApp() {
    const [loading, setLoading] = React.useState(true);
    const [reviews, setReviews] = React.useState([]);
    const [locations, setLocations] = React.useState([]);
    const [filterLoc, setFilterLoc] = React.useState('ALL');
    const [filterUser, setFilterUser] = React.useState('ALL'); // New: Filter by Operator
    const [sortBy, setSortBy] = React.useState('date_desc'); // date_desc, rating_desc, rating_asc
    const [showForm, setShowForm] = React.useState(false);
    const [alert, setAlert] = React.useState(null);

    // Form State
    const [editingId, setEditingId] = React.useState(null);
    const [nickname, setNickname] = React.useState(() => localStorage.getItem('trickle_operator_id') || '');
    const [targetLoc, setTargetLoc] = React.useState('');
    const [rating, setRating] = React.useState(5);
    const [content, setContent] = React.useState('');
    const [submitting, setSubmitting] = React.useState(false);

    // Consumption Form State
    const [showCostForm, setShowCostForm] = React.useState(false);
    const [costAmount, setCostAmount] = React.useState('');
    
    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const locParam = params.get('location');
        if (locParam) {
            setFilterLoc(locParam);
        }
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [fetchedReviews, config] = await Promise.all([
                DB.getReviews(),
                DB.getLatestConfig() // To get available locations for dropdown
            ]);
            
            setReviews(fetchedReviews);
            
            if (config) {
                setLocations(Helpers.safeJsonParse(config.objectData.locations));
                // Default targetLoc to first one if not set
                const locs = Helpers.safeJsonParse(config.objectData.locations);
                if (locs.length > 0 && !targetLoc) setTargetLoc(locs[0]);
            }
        } catch (e) {
            console.warn('[Reviews] Load failed:', e);
            setAlert({ type: 'warning', message: '数据加载受限，请尝试刷新' });
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (review) => {
        setEditingId(review.objectId);
        setNickname(review.objectData.nickname);
        setTargetLoc(review.objectData.location);
        setRating(Number(review.objectData.rating));
        setContent(review.objectData.content);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (reviewId) => {
        if (!confirm('确定要删除这条评价吗？此操作不可恢复。')) return;

        try {
            await DB.deleteReview(reviewId);
            setAlert({ type: 'success', message: '评价已删除' });
            loadData();
        } catch (e) {
            setAlert({ type: 'error', message: '删除失败，请重试' });
        }
    };

    const cancelEdit = () => {
        setShowForm(false);
        setEditingId(null);
        setNickname(localStorage.getItem('trickle_operator_id') || '');
        setContent('');
        setRating(5);
        if (locations.length > 0) setTargetLoc(locations[0]);
    };

    const cancelCostForm = () => {
        setShowCostForm(false);
        setCostAmount('');
    };

    const handleCostSubmit = async (e) => {
        e.preventDefault();
        if (!nickname.trim()) {
            setAlert({ type: 'error', message: '请填写代号' });
            return;
        }
        if (!costAmount || isNaN(costAmount) || Number(costAmount) <= 0) {
             setAlert({ type: 'error', message: '请输入有效的金额' });
             return;
        }

        try {
            setSubmitting(true);
            await DB.addConsumption({
                nickname: nickname.trim(),
                location: targetLoc,
                amount: Number(costAmount)
            });
            
            localStorage.setItem('trickle_operator_id', nickname.trim());
            setAlert({ type: 'success', message: '消费记录已提交' });
            cancelCostForm();
        } catch (e) {
            setAlert({ type: 'error', message: '提交失败' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!nickname.trim()) {
            setAlert({ type: 'error', message: '请填写代号' });
            return;
        }
        
        try {
            setSubmitting(true);
            
            if (editingId) {
                // Update existing
                await DB.updateReview(editingId, {
                    nickname: nickname.trim(),
                    location: targetLoc,
                    rating,
                    content: content.trim(),
                });
                setAlert({ type: 'success', message: '评价已更新！' });
            } else {
                // Add new
                await DB.addReview({
                    nickname: nickname.trim(),
                    location: targetLoc,
                    rating,
                    content: content.trim(),
                    review_date: Helpers.getTodayDateString()
                });
                setAlert({ type: 'success', message: '评价已提交，感谢您的反馈！' });
            }

            localStorage.setItem('trickle_operator_id', nickname.trim());

            // Trigger cache reset for real-time updates elsewhere
            DB.resetVoteCache();

            cancelEdit(); // Reset form
            loadData(); // Reload list
        } catch (e) {
            setAlert({ type: 'error', message: '提交失败，请重试' });
        } finally {
            setSubmitting(false);
        }
    };

    // Extract unique users for filter
    const uniqueUsers = React.useMemo(() => {
        const users = new Set(reviews.map(r => r.objectData.nickname));
        return Array.from(users).sort();
    }, [reviews]);

    // Calculate unreviewed locations for selected user
    const unreviewedLocations = React.useMemo(() => {
        if (filterUser === 'ALL' || locations.length === 0) return [];
        
        const userReviews = reviews.filter(r => r.objectData.nickname === filterUser);
        const reviewedLocs = new Set(userReviews.map(r => r.objectData.location));
        
        return locations.filter(loc => !reviewedLocs.has(loc));
    }, [filterUser, locations, reviews]);

    // Calculate total contribution count for the selected user (ignoring location filter)
    const userTotalCount = React.useMemo(() => {
        if (filterUser === 'ALL') return 0;
        return reviews.filter(r => r.objectData.nickname === filterUser).length;
    }, [reviews, filterUser]);

    const processedReviews = React.useMemo(() => {
        let result = [...reviews];
        
        if (filterLoc !== 'ALL') {
            result = result.filter(r => r.objectData.location === filterLoc);
        }
        
        if (filterUser !== 'ALL') {
            result = result.filter(r => r.objectData.nickname === filterUser);
        }
        
        // Sorting
        result.sort((a, b) => {
            const dataA = a.objectData;
            const dataB = b.objectData;

            if (sortBy === 'rating_desc') {
                // High to Low
                return Number(dataB.rating) - Number(dataA.rating);
            }
            if (sortBy === 'rating_asc') {
                // Low to High
                return Number(dataA.rating) - Number(dataB.rating);
            }
            // Default: date_desc (Latest first)
            // Assuming ISO date string YYYY-MM-DD. If equal, use objectId or creation order if possible, 
            // but simple string compare works for YYYY-MM-DD usually. 
            // Better to handle real Date objects if needed, but string compare is fine for ISO.
            if (dataB.review_date !== dataA.review_date) {
                return dataB.review_date.localeCompare(dataA.review_date);
            }
            // If same date, fallback to newer ID (conceptually) or just random stable sort
            return b.objectId.localeCompare(a.objectId);
        });

        return result;
    }, [reviews, filterLoc, filterUser, sortBy]);

    if (loading) {
        return (
            <Layout activePage="reviews">
                <div className="mb-8 mt-4 text-center animate-pulse">
                    <div className="w-16 h-16 bg-pink-50 rounded-full mx-auto mb-4"></div>
                    <div className="w-48 h-8 bg-gray-200 mx-auto rounded mb-2"></div>
                    <div className="w-64 h-4 bg-gray-100 mx-auto rounded"></div>
                </div>
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-3 md:gap-4 animate-pulse">
                    <div className="grid grid-cols-2 md:flex md:flex-row gap-2 md:gap-4 w-full xl:w-auto flex-grow">
                        <div className="w-full md:w-48 h-10 bg-gray-200 rounded-full"></div>
                        <div className="w-full md:w-48 h-10 bg-gray-200 rounded-full"></div>
                        <div className="w-full md:w-48 h-10 bg-gray-200 rounded-full"></div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="w-32 h-10 bg-gray-200 rounded-full flex-1 md:flex-none"></div>
                        <div className="w-32 h-10 bg-gray-200 rounded-full flex-1 md:flex-none"></div>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="card h-32 bg-gray-50 animate-pulse border-none"></div>
                    <div className="card h-32 bg-gray-50 animate-pulse border-none"></div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout activePage="reviews">
            <div className="text-center mb-8 animate-fade-in-up">
                <div className="inline-block p-3 bg-pink-50 rounded-full mb-4 border border-pink-100">
                    <div className="icon-heart-handshake text-3xl text-[var(--medical-red)]"></div>
                </div>
                <h1 className="text-3xl font-bold text-[var(--primary-color)] mb-2">医疗部·综合评价</h1>
                <p className="text-gray-500 text-sm font-serif">为了干员们的健康，请客观评价您的用餐体验</p>
            </div>

            {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

            {/* User Analysis / Missing Reviews Card */}
            {filterUser !== 'ALL' && (
                <div className="mb-8 animate-fade-in">
                    <div className="bg-white p-5 rounded-sm border border-gray-200 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-[var(--primary-color)]"></div>
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-[var(--primary-color)] text-white flex items-center justify-center font-bold text-xl flex-shrink-0 shadow-md">
                                {filterUser.charAt(0)}
                            </div>
                            <div className="flex-grow">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    干员 {filterUser} 的评价档案
                                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-normal">
                                        累计贡献 {userTotalCount} 条情报
                                    </span>
                                </h3>
                                
                                {unreviewedLocations.length > 0 ? (
                                    <div className="mt-3">
                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                            <div className="icon-clipboard-list"></div>
                                            待探索区域 (Mission Pending)
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {unreviewedLocations.map(loc => (
                                                <button 
                                                    key={loc}
                                                    onClick={() => {
                                                        setTargetLoc(loc);
                                                        setNickname(filterUser);
                                                        setShowForm(true);
                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }}
                                                    className="px-3 py-1 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600 hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] hover:bg-white transition-all dashed-border flex items-center gap-1 group"
                                                >
                                                    {loc}
                                                    <div className="icon-plus text-xs opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-3 text-green-600 text-sm flex items-center gap-2 font-bold bg-green-50 px-3 py-2 rounded inline-block">
                                        <div className="icon-medal"></div>
                                        全区域探索完成！(All Areas Cleared)
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={() => setFilterUser('ALL')}
                                className="text-gray-400 hover:text-gray-600 p-1"
                            >
                                <div className="icon-x"></div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Hint (Location) */}
            {filterLoc !== 'ALL' && filterUser === 'ALL' && (
                <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 mb-6 flex justify-between items-center animate-fade-in rounded-r-sm">
                    <div className="flex items-center gap-2 text-indigo-900 font-bold">
                        <div className="icon-list-filter text-indigo-600"></div>
                        <span>正在查看「{filterLoc}」的评价</span>
                    </div>
                    <button 
                        onClick={() => {
                            setFilterLoc('ALL');
                            // Clear URL param without reload
                            const url = new URL(window.location);
                            url.searchParams.delete('location');
                            window.history.pushState({}, '', url);
                        }}
                        className="text-xs text-indigo-500 hover:text-indigo-800 underline font-bold"
                    >
                        查看全部
                    </button>
                </div>
            )}

            {/* Controls */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-3 md:gap-4 animate-fade-in-up delay-100">
                <div className="grid grid-cols-2 md:flex md:flex-row gap-2 md:gap-4 w-full xl:w-auto flex-grow">
                    {/* Location Filter */}
                    <div className="relative w-full md:w-48">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <div className="icon-store text-gray-400"></div>
                        </div>
                        <select 
                            className="input-field pl-10 py-2 rounded-full border-gray-300 cursor-pointer text-sm"
                            value={filterLoc}
                            onChange={e => setFilterLoc(e.target.value)}
                        >
                            <option value="ALL">全部餐厅</option>
                            {locations.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>

                    {/* User Filter */}
                    <div className="relative w-full md:w-48">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <div className="icon-user text-gray-400"></div>
                        </div>
                        <select 
                            className="input-field pl-10 py-2 rounded-full border-gray-300 cursor-pointer text-sm"
                            value={filterUser}
                            onChange={e => setFilterUser(e.target.value)}
                        >
                            <option value="ALL">全部干员</option>
                            {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>

                    {/* Sort */}
                    <div className="relative w-full md:w-48">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <div className="icon-arrow-up-down text-gray-400"></div>
                        </div>
                        <select 
                            className="input-field pl-10 py-2 rounded-full border-gray-300 cursor-pointer text-sm"
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                        >
                            <option value="date_desc">最新发布</option>
                            <option value="rating_desc">评分最高</option>
                            <option value="rating_asc">评分最低</option>
                        </select>
                    </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto flex-shrink-0">
                    <button 
                        onClick={() => {
                            if (showCostForm) cancelCostForm();
                            else {
                                setShowCostForm(true);
                                setShowForm(false);
                            }
                        }}
                        className={`btn rounded-full px-4 shadow-md hover:shadow-lg flex-1 md:flex-none ${showCostForm ? 'bg-gray-200 text-gray-700' : 'bg-green-600 text-white border-green-600 hover:bg-green-700'}`}
                    >
                        <div className={showCostForm ? "icon-x" : "icon-badge-dollar-sign"}></div>
                        {showCostForm ? '取消' : '上报餐费'}
                    </button>

                    <button 
                        onClick={() => {
                            if (showForm) cancelEdit();
                            else {
                                setShowForm(true);
                                setShowCostForm(false);
                            }
                        }}
                        className={`btn rounded-full px-6 shadow-md hover:shadow-lg flex-1 md:flex-none ${showForm ? 'bg-gray-200 text-gray-700' : 'btn-primary'}`}
                    >
                        <div className={showForm ? "icon-x" : "icon-pencil-line"}></div>
                        {showForm ? '取消' : '撰写评价'}
                    </button>
                </div>
            </div>

            {/* Cost Form */}
            {showCostForm && (
                <div className="card border-l-4 border-l-green-600 animate-scale-in bg-green-50">
                     <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-green-800">
                        <div className="icon-badge-dollar-sign"></div>
                        餐费上报 (仅统计数据)
                    </h3>
                    <form onSubmit={handleCostSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Operator ID</label>
                                <input 
                                    type="text" 
                                    className="input-field bg-white" 
                                    placeholder="代号"
                                    value={nickname}
                                    onChange={e => setNickname(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Location</label>
                                <select 
                                    className="input-field bg-white"
                                    value={targetLoc}
                                    onChange={e => setTargetLoc(e.target.value)}
                                >
                                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Amount (RMB)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-400">¥</span>
                                    <input 
                                        type="number" 
                                        className="input-field bg-white pl-8" 
                                        placeholder="0.00"
                                        step="0.1"
                                        value={costAmount}
                                        onChange={e => setCostAmount(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <button type="submit" disabled={submitting} className="btn bg-green-600 text-white border-green-600 hover:bg-green-700">
                                {submitting ? '提交中...' : '确认上报'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Write/Edit Review Form */}
            {showForm && (
                <div className="card border-l-4 border-l-[var(--medical-red)] animate-scale-in">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <div className="icon-clipboard-plus text-[var(--medical-red)]"></div>
                        {editingId ? '编辑评价' : '填写医疗反馈单'}
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Operator ID</label>
                                <input 
                                    type="text" 
                                    className="input-field" 
                                    placeholder="代号 (Nickname)"
                                    value={nickname}
                                    onChange={e => setNickname(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Location</label>
                                <select 
                                    className="input-field"
                                    value={targetLoc}
                                    onChange={e => setTargetLoc(e.target.value)}
                                >
                                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Rating</label>
                            <div className="flex items-center gap-4 bg-gray-50 p-3 rounded border border-gray-200">
                                <StarRating rating={rating} setRating={setRating} />
                                <span className="text-sm font-bold text-[var(--primary-color)]">
                                    {rating === 5 ? '完美 (Perfect)' : 
                                     rating === 4 ? '推荐 (Good)' :
                                     rating === 3 ? '一般 (Average)' :
                                     rating === 2 ? '较差 (Poor)' : '糟糕 (Terrible)'}
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Content <span className="text-gray-400 font-normal normal-case">(Optional / 选填)</span></label>
                            <textarea 
                                className="input-field h-32 resize-none" 
                                placeholder="请详细描述菜品口味、卫生情况或服务态度..."
                                value={content}
                                onChange={e => setContent(e.target.value)}
                            ></textarea>
                        </div>

                        <div className="flex justify-end pt-2 gap-2">
                             {editingId && (
                                <button type="button" onClick={cancelEdit} className="btn btn-outline">
                                    放弃修改
                                </button>
                            )}
                            <button type="submit" disabled={submitting} className="btn btn-primary w-full md:w-auto min-w-[120px]">
                                {submitting ? '提交中...' : (editingId ? '更新评价' : '提交反馈')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Review List */}
            <div className="space-y-4 animate-fade-in-up delay-200">
                {processedReviews.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">
                        <div className="icon-message-square-off text-4xl mb-2 mx-auto"></div>
                        <p>暂无相关评价记录</p>
                    </div>
                ) : (
                    processedReviews.map((review) => {
                        const rData = review.objectData;
                        return (
                            <div key={review.objectId} className="review-card bg-white p-6 rounded-sm border border-gray-100 shadow-sm hover:shadow-md transition-shadow group relative">
                                <div className="absolute top-4 right-4 hidden group-hover:flex gap-2">
                                    <button 
                                        onClick={() => handleEdit(review)}
                                        className="edit-btn p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded"
                                        title="编辑"
                                    >
                                        <div className="icon-pencil text-xs"></div>
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(review.objectId)}
                                        className="delete-btn p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded"
                                        title="删除"
                                    >
                                        <div className="icon-trash text-xs"></div>
                                    </button>
                                </div>

                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-50 text-[var(--primary-color)] flex items-center justify-center font-bold border border-indigo-100">
                                            {rData.nickname.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900">{rData.nickname}</div>
                                            <div className="text-xs text-gray-500 flex items-center gap-1">
                                                <div className="icon-map-pin text-[10px]"></div>
                                                {rData.location}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right pr-12 md:pr-0">
                                        <StarRating rating={rData.rating} readOnly={true} />
                                        <div className="text-xs text-gray-400 mt-1">{rData.review_date}</div>
                                    </div>
                                </div>
                                <div className="text-gray-700 leading-relaxed bg-gray-50 p-3 rounded text-sm border-l-2 border-[var(--primary-color)] whitespace-pre-wrap">
                                    {rData.content}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
            
            <div className="mt-10 text-center text-gray-400 text-xs">
                罗德岛医疗部 · 饮食健康监测
            </div>
        </Layout>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><ReviewsApp /></ErrorBoundary>);
