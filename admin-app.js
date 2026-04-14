// Reuse ErrorBoundary from app.js conceptually
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { console.error(error, errorInfo); }
  render() { if (this.state.hasError) return <div>Error</div>; return this.props.children; }
}

function AdminApp() {
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [alert, setAlert] = React.useState(null);

    // Config State
    const [locations, setLocations] = React.useState(['老乡鸡', '麦当劳', '赛百味']);
    const [locationLinks, setLocationLinks] = React.useState({}); // { "老乡鸡": "http..." }
    const [locationDescriptions, setLocationDescriptions] = React.useState({}); 
    const [mealTypes, setMealTypes] = React.useState(['午饭', '晚饭']);
    const [mealStatus, setMealStatus] = React.useState({}); // { "午饭": "normal", "晚饭": "cancelled" }
    
    // Inputs
    const [newLoc, setNewLoc] = React.useState('');
    const [editingLoc, setEditingLoc] = React.useState(null); // Currently editing location (for link/desc)
    const [linkInput, setLinkInput] = React.useState('');
    const [descInput, setDescInput] = React.useState('');
    
    // Registry State
    const [locationRegistry, setLocationRegistry] = React.useState({});

    // Votes Management
    const [todayVotes, setTodayVotes] = React.useState([]);

    // Export State
    const [exporting, setExporting] = React.useState(false);

    // Cleanup State
    const [cleanupModal, setCleanupModal] = React.useState(false);
    const [cleanupStep, setCleanupStep] = React.useState('scan'); // scan, preview, pwd, cleaning
    const [cleanupData, setCleanupData] = React.useState({ votes: [], summaries: [] });
    const [cleanupPwd, setCleanupPwd] = React.useState('');

    React.useEffect(() => {
        loadTodayConfig();
        loadVotes();
    }, []);

    const handleExportData = async () => {
        try {
            setExporting(true);
            const allVotes = await DB.getAllVotes();
            
            if (!allVotes || allVotes.length === 0) {
                setAlert({ type: 'warning', message: '暂无历史数据可导出' });
                return;
            }

            // Define CSV Headers
            const headers = ['记录ID', '代号', '报名日期', '餐点类型', '地点', '时间'];
            
            // Format rows
            const rows = allVotes.map(vote => {
                const v = vote.objectData;
                
                // Parse complex fields for text output
                let locStr = v.location || '';
                try { 
                    const parsed = JSON.parse(v.location);
                    if (Array.isArray(parsed)) locStr = parsed.join(' | ');
                } catch(e) {}

                let timeStr = v.time || '';
                try {
                    const parsed = JSON.parse(v.time);
                    if (Array.isArray(parsed)) {
                        timeStr = parsed.map(t => t.start ? `${t.start}-${t.end||''}` : t).join(' | ');
                    }
                } catch(e) {}

                // Escape quotes for CSV
                const escapeCsv = (str) => `"${String(str).replace(/"/g, '""')}"`;

                return [
                    escapeCsv(vote.objectId),
                    escapeCsv(v.nickname),
                    escapeCsv(v.vote_date),
                    escapeCsv(v.meal_type),
                    escapeCsv(locStr),
                    escapeCsv(timeStr)
                ].join(',');
            });

            // Combine headers and rows
            const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n'); // Add BOM for Excel UTF-8 compatibility
            
            // Create Blob and Download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `干饭报名_历史数据_${Helpers.getTodayDateString()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setAlert({ type: 'success', message: `成功导出 ${allVotes.length} 条数据！` });
        } catch (e) {
            console.warn('[Admin] Export failed', e);
            setAlert({ type: 'error', message: '导出失败，请重试' });
        } finally {
            setExporting(false);
        }
    };

    const loadVotes = async () => {
        const todayStr = Helpers.getTodayDateString();
        // Use cache by default (removed true)
        const votes = await DB.getVotes(todayStr);
        setTodayVotes(votes || []);
    };

    const deleteVoteRecord = async (voteId) => {
        if (!confirm('确定要删除这条记录吗？此操作不可恢复。')) return;
        
        try {
            await DB.deleteVote(voteId);
            setAlert({ type: 'success', message: '记录已删除' });
            loadVotes(); // Refresh list
        } catch (e) {
            setAlert({ type: 'error', message: '删除失败，请重试' });
        }
    };

    const loadTodayConfig = async () => {
        try {
            const todayStr = Helpers.getTodayDateString();
            
            // Parallel fetch settings and metadata
            const [settings, metadata] = await Promise.all([
                DB.getSettings(todayStr).then(res => res || DB.getLatestConfig()),
                DB.getSystemMetadata()
            ]);

            if (settings) {
                setLocations(Helpers.safeJsonParse(settings.objectData.locations));
                setLocationLinks(Helpers.safeJsonParse(settings.objectData.location_links, {}));
                setLocationDescriptions(Helpers.safeJsonParse(settings.objectData.location_descriptions, {}));
                setMealTypes(Helpers.safeJsonParse(settings.objectData.meal_types));
                setMealStatus(Helpers.safeJsonParse(settings.objectData.meal_status, {}));
            }
            
            if (metadata) {
                setLocationRegistry(Helpers.safeJsonParse(metadata.objectData.location_registry, {}));
            }
        } catch (err) {
            console.warn('[Admin] Load config failed:', err);
            setAlert({ type: 'warning', message: '部分配置加载失败，请检查网络连接' });
        } finally {
            setLoading(false);
        }
    };

    const startCleanupScan = async () => {
        setCleanupModal(true);
        setCleanupStep('scan');
        const data = await DB.scanCleanupData();
        setCleanupData(data);
        setCleanupStep('preview');
    };

    const confirmCleanup = async () => {
        if (cleanupPwd !== '220913') {
            setAlert({ type: 'error', message: '二级密码错误！' });
            return;
        }
        setCleanupStep('cleaning');
        const itemsToClean = [...cleanupData.votes, ...cleanupData.summaries];
        const count = await DB.executeCleanup(itemsToClean);
        
        setAlert({ type: 'success', message: `清理完成！共硬删除 ${count} 条冗余数据。` });
        setCleanupModal(false);
        setCleanupPwd('');
        loadVotes(); // Refresh view
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const todayStr = Helpers.getTodayDateString();
            
            // Save Settings
            const settingsRes = await DB.saveSettings({
                config_date: todayStr,
                locations,
                location_links: locationLinks,
                location_descriptions: locationDescriptions,
                times: [], 
                meal_types: mealTypes,
                meal_status: mealStatus
            });
            
            // Save Metadata
            const metaRes = await DB.saveSystemMetadata({
                location_registry: locationRegistry
            });

            if (!settingsRes || !metaRes) {
                throw new Error('部分数据保存失败，请检查网络连接');
            }

            setAlert({ type: 'success', message: '所有配置已保存！' });
        } catch (err) {
            setAlert({ type: 'error', message: '保存失败: ' + err.message });
        } finally {
            setSaving(false);
        }
    };

    const toggleMealStatus = (type) => {
        setMealStatus(prev => ({
            ...prev,
            [type]: prev[type] === 'cancelled' ? 'normal' : 'cancelled'
        }));
    };
    
    const addLocation = () => {
        const val = newLoc.trim();
        if (val && !locations.includes(val)) {
            setLocations([...locations, val]);
            
            // Register as new if not exists
            if (!locationRegistry[val]) {
                setLocationRegistry(prev => ({
                    ...prev,
                    [val]: Helpers.getTodayDateString()
                }));
            }
            
            setNewLoc('');
        }
    };

    const removeLocation = (loc) => {
        if (!confirm(`确定要移除地点 "${loc}" 吗？\n注意：这不会删除历史投票数据，但会从今日选项中移除。`)) {
            return;
        }

        setLocations(locations.filter(l => l !== loc));
        
        const newLinks = { ...locationLinks };
        delete newLinks[loc];
        setLocationLinks(newLinks);

        const newDescs = { ...locationDescriptions };
        delete newDescs[loc];
        setLocationDescriptions(newDescs);
    };

    const openEditor = (loc) => {
        setEditingLoc(loc);
        setLinkInput(locationLinks[loc] || '');
        setDescInput(locationDescriptions[loc] || '');
    };

    const saveEditor = () => {
        setLocationLinks({ ...locationLinks, [editingLoc]: linkInput.trim() });
        setLocationDescriptions({ ...locationDescriptions, [editingLoc]: descInput.trim() });
        setEditingLoc(null);
    };

    if (loading) {
        return (
            <Layout activePage="admin">
                <div className="flex justify-between items-center mb-6 animate-pulse mt-2">
                    <div className="w-32 h-8 bg-gray-200 rounded"></div>
                    <div className="w-24 h-4 bg-gray-200 rounded"></div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="card h-32 bg-gray-50 animate-pulse border-none"></div>
                    <div className="card h-40 bg-gray-50 animate-pulse border-none lg:col-span-2"></div>
                </div>
                <div className="card mt-8 h-64 bg-gray-50 animate-pulse border-none"></div>
            </Layout>
        );
    }

    return (
        <Layout activePage="admin">
            <div className="flex justify-between items-center mb-6 animate-fade-in-up">
                <h1 className="text-2xl font-bold text-gray-900">设置面板</h1>
                <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                        <button 
                            onClick={handleExportData} 
                            disabled={exporting}
                            className="btn btn-outline text-sm py-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                        >
                            <div className={exporting ? "icon-loader animate-spin" : "icon-download"}></div>
                            {exporting ? '导出中...' : '导出数据'}
                        </button>
                        <button onClick={startCleanupScan} className="btn btn-outline text-sm py-1.5 border-red-200 text-red-600 hover:bg-red-50">
                            <div className="icon-trash-2"></div>
                            空间清理
                        </button>
                    </div>
                    <div className="text-sm text-gray-500 hidden sm:block">日期: {Helpers.getTodayDateString()}</div>
                </div>
            </div>

            {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

            {/* Cleanup Modal */}
            {cleanupModal && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-red-800 flex items-center gap-2">
                                <div className="icon-shield-alert"></div>
                                系统数据清理
                            </h3>
                            <button onClick={() => setCleanupModal(false)} className="text-gray-500 hover:text-gray-800">
                                <div className="icon-x"></div>
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-grow">
                            {cleanupStep === 'scan' && (
                                <div className="text-center py-8">
                                    <div className="icon-loader animate-spin text-4xl text-gray-300 mx-auto mb-4"></div>
                                    <p className="text-gray-600">正在全库扫描过期及冗余数据...</p>
                                </div>
                            )}

                            {cleanupStep === 'cleaning' && (
                                <div className="text-center py-8">
                                    <div className="icon-loader animate-spin text-4xl text-red-400 mx-auto mb-4"></div>
                                    <p className="text-gray-600">正在粉碎数据，请勿关闭窗口...</p>
                                </div>
                            )}

                            {(cleanupStep === 'preview' || cleanupStep === 'pwd') && (
                                <div>
                                    <div className="bg-orange-50 text-orange-800 p-3 rounded-sm text-sm mb-4 border border-orange-100">
                                        扫描完成！共发现 <strong>{cleanupData.votes.length + cleanupData.summaries.length}</strong> 条可清理数据。
                                    </div>
                                    
                                    <div className="max-h-48 overflow-y-auto bg-gray-50 border border-gray-200 rounded p-2 text-xs font-mono space-y-1 mb-6">
                                        {cleanupData.votes.length === 0 && cleanupData.summaries.length === 0 ? (
                                            <div className="text-gray-400 text-center py-4">无冗余数据</div>
                                        ) : (
                                            [...cleanupData.votes, ...cleanupData.summaries].map((item, i) => (
                                                <div key={i} className="flex justify-between border-b border-gray-100 pb-1">
                                                    <span className="text-gray-600">[{item.type}] {item.detail}</span>
                                                    <span className="text-red-500">{item.reason}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {cleanupStep === 'pwd' ? (
                                        <div className="animate-fade-in-up">
                                            <label className="block text-sm font-bold text-gray-700 mb-2">请输入二级密码确认删除</label>
                                            <input 
                                                type="password" 
                                                className="input-field mb-4" 
                                                placeholder="输入密码"
                                                value={cleanupPwd}
                                                onChange={e => setCleanupPwd(e.target.value)}
                                            />
                                            <div className="flex gap-3">
                                                <button onClick={() => setCleanupStep('preview')} className="btn btn-outline flex-1">返回</button>
                                                <button onClick={confirmCleanup} className="btn bg-red-600 text-white hover:bg-red-700 flex-1">确认粉碎</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex justify-end gap-3">
                                            <button onClick={() => setCleanupModal(false)} className="btn btn-outline">取消</button>
                                            <button 
                                                onClick={() => setCleanupStep('pwd')} 
                                                disabled={cleanupData.votes.length === 0 && cleanupData.summaries.length === 0}
                                                className="btn bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300 disabled:text-gray-500"
                                            >
                                                清理数据
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Editor Modal */}
            {editingLoc && (
                <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl animate-scale-in">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg">编辑详情 - {editingLoc}</h3>
                            <button onClick={() => setEditingLoc(null)} className="hover:bg-gray-100 p-1 rounded">
                                <div className="icon-x text-gray-500"></div>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">商户简介</label>
                                <textarea 
                                    className="input-field h-24 resize-none" 
                                    placeholder="推荐菜品、口味特点、人均价格等..." 
                                    value={descInput}
                                    onChange={e => setDescInput(e.target.value)}
                                ></textarea>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">外部链接 (点评/外卖)</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <div className="icon-link text-gray-400"></div>
                                    </div>
                                    <input 
                                        className="input-field pl-10" 
                                        placeholder="https://..." 
                                        value={linkInput}
                                        onChange={e => setLinkInput(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setEditingLoc(null)} className="btn btn-outline">取消</button>
                            <button onClick={saveEditor} className="btn btn-primary">保存</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-up delay-100">

                {/* Meal Status Control */}
                <div className="card">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <div className="icon-toggle-left text-[var(--primary-color)]"></div>
                        今日供餐状态
                    </h3>
                    <div className="flex gap-4">
                        {mealTypes.map(type => {
                            const isCancelled = mealStatus[type] === 'cancelled';
                            return (
                                <button
                                    key={type}
                                    onClick={() => toggleMealStatus(type)}
                                    className={`flex-1 p-4 rounded-xl border-2 transition-all flex items-center justify-between
                                        ${isCancelled 
                                            ? 'border-gray-200 bg-gray-50 text-gray-400' 
                                            : 'border-green-500 bg-green-50 text-green-700'}
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${isCancelled ? 'bg-gray-200' : 'bg-green-200'}`}>
                                            <div className={type === '午饭' ? 'icon-sun' : 'icon-moon'}></div>
                                        </div>
                                        <span className="font-bold">{type}</span>
                                    </div>
                                    <div className="text-sm font-medium">
                                        {isCancelled ? '已取消' : '开放中'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Locations */}
                <div className="card lg:col-span-2">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <div className="icon-map-pin text-[var(--primary-color)]"></div>
                        地点选项
                    </h3>
                    <div className="flex gap-2 mb-4">
                        <input 
                            type="text" 
                            className="input-field" 
                            placeholder="输入地点名称"
                            value={newLoc}
                            onChange={e => setNewLoc(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addLocation()}
                        />
                        <button onClick={addLocation} className="btn btn-outline">
                            <div className="icon-plus"></div>
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {locations.map(loc => {
                            const hasInfo = locationLinks[loc] || locationDescriptions[loc];
                            return (
                                <div key={loc} className="bg-gray-50 border border-gray-200 pl-3 pr-2 py-2 rounded-lg flex items-center gap-2 text-sm group">
                                    <span className="font-medium">{loc}</span>
                                    
                                    <button 
                                        onClick={() => openEditor(loc)} 
                                        className={`p-1 rounded hover:bg-indigo-100 transition-colors ${hasInfo ? 'text-[var(--primary-color)]' : 'text-gray-400'}`}
                                        title="编辑详情"
                                    >
                                        <div className="icon-pencil text-xs"></div>
                                    </button>

                                    <div className="w-px h-4 bg-gray-300 mx-1"></div>

                                    <button onClick={() => removeLocation(loc)} className="text-gray-400 hover:text-red-500">
                                        <div className="icon-x text-xs"></div>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="btn btn-primary w-full md:w-auto min-w-[120px]"
                    >
                        {saving ? '保存中...' : '保存配置'}
                    </button>
                </div>
            </div>

            {/* Vote Management Section */}
            <div className="card mt-8 animate-fade-in-up delay-200">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-red-700">
                    <div className="icon-trash-2"></div>
                    今日数据管理
                </h3>
                
                {todayVotes.length === 0 ? (
                    <div className="text-gray-400 text-sm py-4">今日暂无投票记录</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-bold">
                                <tr>
                                    <th className="p-3 rounded-tl-lg">代号</th>
                                    <th className="p-3">类型</th>
                                    <th className="p-3">地点</th>
                                    <th className="p-3">时间</th>
                                    <th className="p-3 rounded-tr-lg text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {todayVotes.map(vote => {
                                    const v = vote.objectData;
                                    // Parse complex fields for display
                                    let locStr = v.location;
                                    try { 
                                        const parsed = JSON.parse(v.location);
                                        if (Array.isArray(parsed)) locStr = parsed.join(', ');
                                    } catch(e) {}

                                    let timeStr = v.time;
                                    try {
                                        const parsed = JSON.parse(v.time);
                                        if (Array.isArray(parsed)) {
                                             timeStr = parsed.map(t => t.start ? `${t.start}` : t).join(', ');
                                        }
                                    } catch(e) {}

                                    return (
                                        <tr key={vote.objectId} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-3 font-medium text-gray-900">{v.nickname}</td>
                                            <td className="p-3 text-gray-600">{v.meal_type}</td>
                                            <td className="p-3 text-gray-600 max-w-[150px] truncate" title={locStr}>{locStr}</td>
                                            <td className="p-3 text-gray-400">{timeStr}</td>
                                            <td className="p-3 text-right">
                                                <button 
                                                    onClick={() => deleteVoteRecord(vote.objectId)}
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-colors"
                                                    title="删除此条记录"
                                                >
                                                    <div className="icon-trash text-sm"></div>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Layout>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <AdminApp />
  </ErrorBoundary>
);