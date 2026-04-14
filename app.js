// Important: DO NOT remove this `ErrorBoundary` component.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Something went wrong</h1>
            <p className="text-gray-600 mb-4">We're sorry, but something unexpected happened.</p>
            <button onClick={() => window.location.reload()} className="btn btn-primary mx-auto">
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
    const [loading, setLoading] = React.useState(true);
    const [submitting, setSubmitting] = React.useState(false);
    const [config, setConfig] = React.useState(null);
    const [alert, setAlert] = React.useState(null);
    
    // Blocked locations (recently visited)
    const [blockedLocations, setBlockedLocations] = React.useState([]);
    // New locations (added within 7 days)
    const [newLocations, setNewLocations] = React.useState([]);
    const [seenNewLocations, setSeenNewLocations] = React.useState(() => {
        try {
            return JSON.parse(localStorage.getItem('seen_new_locations') || '[]');
        } catch { return []; }
    });
    
    // Info Modal
    const [infoModalData, setInfoModalData] = React.useState(null); // { loc, desc, link }
    const [reviewStats, setReviewStats] = React.useState({}); // { "Loc": { avg, count } }
    const [costStats, setCostStats] = React.useState({}); // { "Loc": { avg, count, min, max } }

    // Form State
    const [nickname, setNickname] = React.useState(() => localStorage.getItem('trickle_operator_id') || '');
    const [selectedMealType, setSelectedMealType] = React.useState('');
    const [selectedLocations, setSelectedLocations] = React.useState([]); 
    
    // Simplified Time State (Direct Start/End instead of list)
    const [startTime, setStartTime] = React.useState('');
    const [endTime, setEndTime] = React.useState('');

    const [lastVote, setLastVote] = React.useState(null);

    // Specific Time Options - Modern Format as requested
    const LUNCH_ENDS = ['10:50', '11:50', '12:50'];
    const LUNCH_STARTS = ['12:00', '13:00', '14:00'];
    const DINNER_ENDS = ['16:50', '17:50', '18:50'];

    // Sort locations by rating (High to Low)
    const sortedLocations = React.useMemo(() => {
        if (!config || !config.locations) return [];
        
        return [...config.locations].sort((a, b) => {
            const statA = reviewStats[a] || { avg: 0, count: 0 };
            const statB = reviewStats[b] || { avg: 0, count: 0 };
            
            const scoreA = Number(statA.avg);
            const scoreB = Number(statB.avg);
            
            if (scoreB !== scoreA) return scoreB - scoreA;
            return statB.count - statA.count; // If avg is same, more reviews = higher
        });
    }, [config, reviewStats]);

    React.useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            setLoading(true);
            const todayStr = Helpers.getTodayDateString();
            
            // 1. Fetch critical config first to block render as little as possible
            const settingsObj = await DB.getSettings(todayStr).then(res => res || DB.getLatestConfig());

            // History blocking removed as per request
            setBlockedLocations([]);
            
            if (settingsObj) {
                setConfig({
                    locations: Helpers.safeJsonParse(settingsObj.objectData.locations),
                    times: Helpers.safeJsonParse(settingsObj.objectData.times),
                    meal_types: Helpers.safeJsonParse(settingsObj.objectData.meal_types),
                    location_links: Helpers.safeJsonParse(settingsObj.objectData.location_links, {}),
                    location_descriptions: Helpers.safeJsonParse(settingsObj.objectData.location_descriptions, {}),
                    meal_status: Helpers.safeJsonParse(settingsObj.objectData.meal_status, {})
                });
                const types = Helpers.safeJsonParse(settingsObj.objectData.meal_types);
                if (types.length > 0) setSelectedMealType(types[0]);
            } else {
                setConfig(null);
            }

            // End loading right after config is loaded
            setLoading(false);

            // 2. Fetch non-critical data in parallel asynchronously without blocking UI
            Promise.allSettled([
                DB.getSystemMetadata(),
                DB.getReviewStats(),
                DB.getConsumptionStats()
            ]).then(([metaRes, statsRes, costsRes]) => {
                if (statsRes.status === 'fulfilled' && statsRes.value) {
                    setReviewStats(statsRes.value);
                }
                if (costsRes.status === 'fulfilled' && costsRes.value) {
                    setCostStats(costsRes.value);
                }
                
                if (metaRes.status === 'fulfilled' && metaRes.value) {
                    const metadataObj = metaRes.value;
                    const registry = Helpers.safeJsonParse(metadataObj.objectData?.location_registry, {});
                    const recentLocs = [];
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    
                    Object.entries(registry).forEach(([loc, dateStr]) => {
                        const date = new Date(dateStr);
                        if (date >= sevenDaysAgo) {
                            recentLocs.push(loc);
                        }
                    });
                    setNewLocations(recentLocs);
                }
            }).catch(e => console.warn('[App] Background data sync failed', e));

        } catch (err) {
            console.warn('[App] Load config failed:', err);
            // Only show alert, reduce console noise for network errors
            const msg = (err.message && err.message.includes('Failed to fetch')) 
                ? '网络连接不稳定，请检查网络后刷新' 
                : '加载配置失败，请刷新重试';
            setAlert({ type: 'warning', message: msg });
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        setStartTime('');
        setEndTime('');
    }, [selectedMealType]);

    React.useEffect(() => {
        if (nickname && selectedMealType) {
            try {
                const saved = localStorage.getItem(`trickle_last_vote_${nickname.trim()}_${selectedMealType}`);
                if (saved) {
                    setLastVote(JSON.parse(saved));
                } else {
                    setLastVote(null);
                }
            } catch(e) { setLastVote(null); }
        } else {
            setLastVote(null);
        }
    }, [nickname, selectedMealType]);

    const toggleLocation = (loc) => {
        if (blockedLocations.includes(loc)) return; // Prevent selection

        // Mark as seen if it's new
        if (newLocations.includes(loc) && !seenNewLocations.includes(loc)) {
            const updated = [...seenNewLocations, loc];
            setSeenNewLocations(updated);
            localStorage.setItem('seen_new_locations', JSON.stringify(updated));
        }

        if (selectedLocations.includes(loc)) {
            setSelectedLocations(selectedLocations.filter(item => item !== loc));
        } else {
            setSelectedLocations([...selectedLocations, loc]);
        }
    };

    const toggleAnyLocation = () => {
        // "Random/Any" logic: Select ALL available (non-blocked) locations
        
        const availableLocs = config.locations.filter(l => !blockedLocations.includes(l));
        const allSelected = availableLocs.every(l => selectedLocations.includes(l));

        if (allSelected) {
            // If already all selected, clear selection (toggle off)
            setSelectedLocations([]);
        } else {
            // Select all
            setSelectedLocations(availableLocs);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!nickname.trim()) {
            setAlert({ type: 'error', message: '请输入昵称' });
            return;
        }

        // Validate Nickname Length (5 Chinese or 10 English chars approx)
        // Weight: Chinese = 2, English = 1. Max total = 10.
        let nameLen = 0;
        for (let i = 0; i < nickname.length; i++) {
            nameLen += (nickname.charCodeAt(i) > 127 || nickname.charCodeAt(i) === 94) ? 2 : 1;
        }
        if (nameLen > 10) {
            setAlert({ type: 'error', message: '干员代号过长 (限5个汉字或10个字母)' });
            return;
        }
        
        // Validate Time
        if (!startTime) {
             setAlert({ type: 'error', message: '请选择开始时间' });
             return;
        }
        if (selectedMealType === '午饭' && !endTime) {
            setAlert({ type: 'error', message: '请选择结束时间' });
            return;
        }

        if (selectedLocations.length === 0) {
            setAlert({ type: 'error', message: '请至少选择一个地点' });
            return;
        }

        // Construct single time slot payload
        const timePayload = [{ start: startTime, end: endTime }];

        try {
            setSubmitting(true);
            const result = await DB.submitVote({
                nickname: nickname.trim(),
                meal_type: selectedMealType,
                time: timePayload,
                location: selectedLocations,
                vote_date: Helpers.getTodayDateString()
            });
            
            if (!result) {
                throw new Error('Database submission failed');
            }

            // Save nickname for future convenience
            localStorage.setItem('trickle_operator_id', nickname.trim());
            
            // Save last vote for auto-fill convenience
            localStorage.setItem(`trickle_last_vote_${nickname.trim()}_${selectedMealType}`, JSON.stringify({
                locations: selectedLocations,
                startTime,
                endTime
            }));

            setAlert({ type: 'success', message: '报名成功！即将跳转到结果页...' });
            
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        } catch (err) {
            setAlert({ type: 'error', message: '提交失败，网络连接可能不稳定，请重试。' });
            setSubmitting(false);
        }
    };

    const openLocationInfo = (e, loc) => {
        e.stopPropagation();
        setInfoModalData({
            location: loc,
            description: config.location_descriptions?.[loc],
            link: config.location_links?.[loc],
            stats: reviewStats[loc] || { avg: 0, count: 0 },
            cost: costStats[loc] || null
        });
    };

    if (loading) {
        return (
            <Layout activePage="home">
                <div className="max-w-2xl mx-auto space-y-6">
                    <div className="flex flex-col items-center justify-center mb-10 mt-6">
                        <div className="w-16 h-16 rounded-full bg-gray-200 animate-pulse border-4 border-white shadow-sm mb-4"></div>
                        <div className="w-48 h-8 bg-gray-200 animate-pulse rounded mb-2"></div>
                        <div className="w-32 h-4 bg-gray-100 animate-pulse rounded"></div>
                    </div>
                    <div className="card h-28 bg-gray-50 animate-pulse border-none"></div>
                    <div className="card h-40 bg-gray-50 animate-pulse border-none"></div>
                    <div className="card h-48 bg-gray-50 animate-pulse border-none"></div>
                </div>
            </Layout>
        );
    }

    if (!config) {
        return (
            <Layout activePage="home">
                <div className="card text-center py-12 border-dashed border-gray-300 animate-fade-in-up">
                    <div className="icon-calendar-off text-4xl text-gray-300 mx-auto mb-4"></div>
                    <h2 className="text-xl font-bold text-[var(--primary-color)] mb-2">任务暂未发布</h2>
                    <p className="text-gray-500 mb-6 font-serif text-sm">指挥中心尚未录入今日作战情报，请稍候。</p>
                </div>
            </Layout>
        );
    }

    // Check if "Any" is effectively active
    const availableLocs = config.locations.filter(l => !blockedLocations.includes(l));
    const isAnySelected = availableLocs.length > 0 && availableLocs.every(l => selectedLocations.includes(l));
    
    // Check if current meal is cancelled
    const isCancelled = config.meal_status?.[selectedMealType] === 'cancelled';

    return (
        <Layout activePage="home">
            <div className="max-w-2xl mx-auto relative">
                 <div className="mb-12 text-center relative z-10">
                    <div className="inline-block mb-4">
                        <div className="w-16 h-16 mx-auto border-4 border-[var(--primary-color)] rounded-full flex items-center justify-center mb-4 bg-white shadow-lg">
                            <span className="text-2xl font-bold text-[var(--primary-color)] font-serif">食</span>
                        </div>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold text-[var(--primary-color)] mb-2 drop-shadow-sm tracking-wide">
                        罗德岛·膳食部
                    </h1>
                     <div className="flex items-center justify-center gap-4 text-[var(--text-muted)] text-sm tracking-[0.2em] font-bold">
                        <span className="h-px w-8 bg-gray-300"></span>
                        {Helpers.getTodayDateString().replace(/-/g, ' . ')}
                        <span className="h-px w-8 bg-gray-300"></span>
                    </div>
                </div>

                {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
                
                {infoModalData && (
                    <LocationInfoModal 
                        location={infoModalData.location}
                        description={infoModalData.description}
                        link={infoModalData.link}
                        stats={infoModalData.stats}
                        cost={infoModalData.cost}
                        onClose={() => setInfoModalData(null)}
                    />
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Meal Type */}
                    <div className="card animate-fade-in-up">
                        <label className="label mb-3">行动类别 (Target)</label>
                        <div className="grid grid-cols-2 gap-3">
                            {config.meal_types.map(type => {
                                const cancelled = config.meal_status?.[type] === 'cancelled';
                                return (
                                    <div 
                                        key={type}
                                        onClick={() => !cancelled && setSelectedMealType(type)}
                                        className={`radio-card justify-center ${selectedMealType === type ? 'selected' : ''} ${cancelled ? 'opacity-60 bg-gray-100 cursor-not-allowed' : ''}`}
                                    >
                                        <span className="font-bold text-lg">{type}</span>
                                        {selectedMealType === type && !cancelled && <div className="seal-mark">确认</div>}
                                        {cancelled && <span className="absolute top-2 right-2 text-[10px] text-[var(--secondary-color)] border border-[var(--secondary-color)] px-1 py-0.5 rounded shadow-sm bg-white/50">停止</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {isCancelled ? (
                        <div className="card text-center py-10 border-dashed border-gray-300 animate-fade-in-up delay-100 bg-gray-50/50">
                            <div className="icon-coffee text-4xl text-gray-400 mx-auto mb-3"></div>
                            <h3 className="text-lg font-bold text-gray-600">今日{selectedMealType}任务取消</h3>
                            <p className="text-gray-500 text-sm mt-1 font-serif">指挥中心已关闭该作战通道</p>
                        </div>
                    ) : (
                        <>
                            {/* Time Selection */}
                    <div className="card animate-fade-in-up delay-100">
                        <label className="label mb-4">
                            {selectedMealType === '午饭' ? '选择空闲时间' : '选择开始时间'}
                        </label>
                        
                        <div className="p-2 relative">
                            <div className="flex flex-col sm:flex-row gap-6 items-end">
                                <div className="flex-1 w-full">
                                    <label className="text-xs text-gray-500 mb-2 block tracking-wider uppercase">
                                        {selectedMealType === '午饭' ? 'Start Time' : 'Start Time'}
                                    </label>
                                    <div className="relative">
                                        <select 
                                            className="input-field appearance-none bg-transparent font-mono text-lg"
                                            value={startTime}
                                            onChange={e => setStartTime(e.target.value)}
                                        >
                                            <option value="">--:--</option>
                                            {(selectedMealType === '午饭' ? LUNCH_ENDS : DINNER_ENDS).map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-0 top-3 pointer-events-none text-gray-400 text-xs">▼</div>
                                    </div>
                                </div>
                                
                                {selectedMealType === '午饭' && (
                                    <>
                                        <div className="text-gray-300 pb-2 hidden sm:block font-light">/</div>
                                        <div className="flex-1 w-full">
                                            <label className="text-xs text-gray-500 mb-2 block tracking-wider uppercase">End Time</label>
                                            <div className="relative">
                                                <select 
                                                    className="input-field appearance-none bg-transparent font-mono text-lg"
                                                    value={endTime}
                                                    onChange={e => setEndTime(e.target.value)}
                                                >
                                                    <option value="">--:--</option>
                                                    {LUNCH_STARTS.map(t => (
                                                        <option key={t} value={t}>{t}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-0 top-3 pointer-events-none text-gray-400 text-xs">▼</div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Location Selection */}
                    <div className="card animate-fade-in-up delay-200">
                        <label className="label mb-4">目标地点 <span className="text-xs font-normal text-gray-400 ml-2">(综合考量排序)</span></label>
                        <div className="flex flex-wrap gap-4">
                            {/* "Random/Any" Option */}
                            <div 
                                onClick={toggleAnyLocation}
                                className={`
                                    border-2 border-dashed rounded-sm px-6 py-3 transition-all flex items-center gap-2 cursor-pointer
                                    ${isAnySelected
                                        ? 'border-[var(--primary-color)] bg-gray-100 text-[var(--primary-color)]' 
                                        : 'hover:border-[var(--primary-color)] border-gray-300 text-gray-500'}
                                `}
                            >
                                <div className="icon-shuffle"></div>
                                <span className="font-bold whitespace-nowrap">随意</span>
                            </div>

                            {sortedLocations.map(loc => {
                                const isBlocked = blockedLocations.includes(loc);
                                const isNew = newLocations.includes(loc) && !seenNewLocations.includes(loc);
                                const stats = reviewStats[loc];
                                const hasRating = stats && stats.count > 0;
                                
                                // Show info if: has desc OR has link OR has reviews
                                const hasInfo = (config.location_descriptions?.[loc] && config.location_descriptions[loc].trim()) || 
                                              (config.location_links?.[loc] && config.location_links[loc].trim()) ||
                                              hasRating;
                                              
                                const isSelected = selectedLocations.includes(loc);

                                return (
                                    <div 
                                        key={loc}
                                        onClick={() => toggleLocation(loc)}
                                        className={`
                                            relative border rounded-sm px-5 py-3 transition-all flex items-center gap-2 group
                                            ${isBlocked ? 'opacity-40 cursor-not-allowed bg-gray-50 grayscale' : 'cursor-pointer'}
                                            ${!isBlocked && isSelected
                                                ? 'border-[var(--primary-color)] bg-white text-[var(--primary-color)] shadow-md ring-1 ring-[var(--primary-color)]' 
                                                : !isBlocked && 'hover:border-[var(--primary-color)] border-gray-200 bg-white text-gray-700'}
                                        `}
                                    >
                                        {/* Seal Mark for Selected */}
                                        {!isBlocked && isSelected && <div className="seal-mark">已选</div>}

                                        {/* New Badge */}
                                        {isNew && !isBlocked && (
                                            <span className="absolute -top-3 -right-2 bg-[var(--secondary-color)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm shadow-sm z-10">
                                                新
                                            </span>
                                        )}

                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1">
                                                <span className="font-bold whitespace-nowrap text-lg">{loc}</span>
                                                {hasRating && (
                                                    <div className="flex items-center text-[10px] bg-yellow-50 text-yellow-600 px-1 rounded border border-yellow-100 ml-1">
                                                        <span className="icon-star text-[8px] fill-yellow-500 mr-0.5"></span>
                                                        {stats.avg}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {hasInfo && (
                                            <button 
                                                type="button"
                                                onClick={(e) => openLocationInfo(e, loc)}
                                                className="ml-1 opacity-40 hover:opacity-100 transition-opacity text-[var(--primary-color)]"
                                                title="详情"
                                            >
                                                <div className="icon-scroll-text text-base"></div>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Nickname */}
                    <div className="card animate-fade-in-up delay-300">
                        <label className="label" htmlFor="nickname">干员代号 (Operator)</label>
                        <div className="relative mt-4">
                            <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none">
                                <div className="icon-hash text-gray-400"></div>
                            </div>
                            <input 
                                id="nickname"
                                type="text" 
                                className="input-field pl-8 font-bold text-lg text-[var(--primary-color)]" 
                                placeholder="INPUT CODENAME"
                                value={nickname}
                                onChange={e => setNickname(e.target.value)}
                            />
                        </div>
                    </div>

                            {lastVote && (
                                <div className="card bg-indigo-50 border-l-4 border-indigo-500 animate-fade-in-up delay-300 py-4 flex items-center justify-between mb-6">
                                    <div>
                                        <div className="text-sm font-bold text-indigo-900 flex items-center gap-1">
                                            <div className="icon-zap text-indigo-600"></div> 一键照旧
                                        </div>
                                        <div className="text-xs text-indigo-700 mt-1">
                                            上次选择了: {lastVote.locations.join(', ')} ({lastVote.startTime}{lastVote.endTime ? ` - ${lastVote.endTime}` : ''})
                                        </div>
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            const validLocs = lastVote.locations.filter(l => config.locations.includes(l));
                                            if (validLocs.length > 0) setSelectedLocations(validLocs);
                                            if (lastVote.startTime) setStartTime(lastVote.startTime);
                                            if (lastVote.endTime) setEndTime(lastVote.endTime);
                                            setAlert({ type: 'success', message: '已自动填入上次的选项' });
                                        }} 
                                        className="btn bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-100 text-sm py-1.5 px-3 shrink-0 ml-4 shadow-sm"
                                    >
                                        自动填入
                                    </button>
                                </div>
                            )}

                            <div className="animate-fade-in-up delay-400">
                                <button 
                                    type="submit" 
                                    disabled={submitting}
                                    className="btn btn-primary w-full py-4 text-xl mt-2 shadow-xl"
                                >
                                    <span className="font-bold tracking-[0.3em]">{submitting ? '数据传输中...' : '确认 / 报名'}</span>
                                </button>
                            </div>
                        </>
                    )}
                </form>
            </div>
        </Layout>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);