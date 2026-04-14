// Reuse ErrorBoundary
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { console.error(error, errorInfo); }
  render() { if (this.state.hasError) return <div>Error</div>; return this.props.children; }
}

function VoteItem({ vote, topLocation, formatMulti }) {
    const [expanded, setExpanded] = React.useState(false);
    
    let locs = [];
    try {
        locs = formatMulti(vote.location).split(', ').filter(Boolean);
    } catch(e) {
        locs = [vote.location];
    }
    
    const timeStr = formatMulti(vote.time);
    const colors = ['bg-red-100 text-red-700', 'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-yellow-100 text-yellow-700', 'bg-purple-100 text-purple-700', 'bg-pink-100 text-pink-700', 'bg-indigo-100 text-indigo-700'];
    const charCode = vote.nickname.charCodeAt(0) || 0;
    const colorClass = colors[charCode % colors.length];

    // Limit items to 4 to strictly simulate max 2 lines on most screens
    const LIMIT = 4;
    const showAll = expanded || locs.length <= LIMIT;
    const displayedLocs = showAll ? locs : locs.slice(0, LIMIT);

    return (
        <div className="flex flex-col sm:flex-row sm:items-start justify-between p-3 bg-white border border-gray-100 shadow-sm rounded-lg hover:shadow-md hover:border-[var(--primary-color)] transition-all group gap-3 sm:gap-4">
            <div className="flex items-center gap-3 shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${colorClass} shadow-inner`}>
                    {vote.nickname.charAt(0)}
                </div>
                <div>
                    <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                        {vote.nickname}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                        <div className="icon-clock text-[10px]"></div>
                        {timeStr}
                    </div>
                </div>
            </div>
            
            <div className="flex flex-wrap gap-1.5 sm:justify-end pl-[52px] sm:pl-0 flex-grow">
                {displayedLocs.map((loc, i) => {
                    const isTop = loc === topLocation;
                    return (
                        <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border max-w-full ${isTop ? 'bg-yellow-50 border-yellow-200 text-yellow-700 font-bold' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                            {isTop && <div className="icon-crown text-[10px] text-yellow-500 shrink-0"></div>}
                            <span className="truncate">{loc}</span>
                        </span>
                    );
                })}
                {!showAll && (
                    <button onClick={() => setExpanded(true)} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100 cursor-pointer transition-colors">
                        展开 (+{locs.length - LIMIT})
                    </button>
                )}
                {expanded && locs.length > LIMIT && (
                    <button onClick={() => setExpanded(false)} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 cursor-pointer transition-colors">
                        收起
                    </button>
                )}
            </div>
        </div>
    );
}

function DashboardApp() {
    const [loading, setLoading] = React.useState(true);
    const [rawVotes, setRawVotes] = React.useState([]);
    const latestVotesRef = React.useRef([]); // Ref to track latest data for comparison
    
    // Default based on time: < 15:00 ? Lunch : Dinner
    const [activeTab, setActiveTab] = React.useState(() => {
        const hour = new Date().getHours();
        return hour >= 15 ? '晚饭' : '午饭';
    });
    
    const [availableTabs, setAvailableTabs] = React.useState(['午饭', '晚饭']);

    React.useEffect(() => {
        initLoad().catch(e => console.warn('Dashboard init failed', e));
        // Poll every 5 seconds for real-time updates
        const interval = setInterval(() => {
            loadData().catch(e => console.warn('Dashboard poll failed', e));
        }, 5000); 
        return () => clearInterval(interval);
    }, []);

    const initLoad = async () => {
        await Promise.all([loadConfig(), loadData()]);
    };

    const loadConfig = async () => {
        try {
            const todayStr = Helpers.getTodayDateString();
            let settings = await DB.getSettings(todayStr);
            if (!settings) settings = await DB.getLatestConfig();

            if (settings) {
                const types = Helpers.safeJsonParse(settings.objectData.meal_types);
                if (types && types.length > 0) {
                    setAvailableTabs(types);
                    // Ensure activeTab is valid
                    setActiveTab(current => {
                        if (types.includes(current)) return current;
                        // If current time-based default isn't in config, try to be smart
                        const hour = new Date().getHours();
                        if (hour >= 15 && types.includes('晚饭')) return '晚饭';
                        if (types.includes('午饭')) return '午饭';
                        return types[0];
                    });
                }
            }
        } catch (e) {
            console.warn('Failed to load config for dashboard tabs', e);
        }
    };

    const loadData = async () => {
        try {
            const todayStr = Helpers.getTodayDateString();
            
            // Real-time: Force refresh (bypass cache)
            const items = await DB.getVotes(todayStr, true);
            const votesData = items.map(i => i.objectData);
            
            // Check for changes before updating state to avoid unnecessary re-renders
            const prevStr = JSON.stringify(latestVotesRef.current);
            const newStr = JSON.stringify(votesData);

            if (prevStr !== newStr) {
                // Data changed, update state and chart
                latestVotesRef.current = votesData;
                setRawVotes(votesData);
            }

            setLoading(false);
            return items; 
        } catch (err) {
            // Suppress error log for polling failures to avoid spamming console
            if (loading) {
                 setLoading(false);
                 console.warn("Dashboard initial load failed:", err);
            }
            return null;
        }
    };

    const currentVotes = rawVotes.filter(v => v.meal_type === activeTab);

    const timeStats = React.useMemo(() => {
        const stats = {};
        currentVotes.forEach(vote => {
            let slots = [];
            try {
                slots = typeof vote.time === 'string' ? JSON.parse(vote.time) : vote.time;
            } catch(e) {}
            if (!Array.isArray(slots)) slots = [slots];

            slots.forEach(slot => {
                let timeKey = '';
                if (typeof slot === 'string') timeKey = slot;
                else if (slot && slot.start) timeKey = slot.end ? `${slot.start} - ${slot.end}` : `${slot.start} 起`;
                
                if (timeKey) {
                    if (!stats[timeKey]) stats[timeKey] = { count: 0, people: [] };
                    stats[timeKey].count++;
                    stats[timeKey].people.push(vote.nickname);
                }
            });
        });
        
        // Sort by time string
        return Object.entries(stats)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([time, data]) => ({ time, ...data }));
    }, [currentVotes]);

    const calculateStats = (data) => {
        if (!data || data.length === 0) return null;
        
        const locCounts = {};
        data.forEach(item => {
            let locs = [];
            try { locs = JSON.parse(item.location); } catch { locs = [item.location]; }
            if (!Array.isArray(locs)) locs = [locs];
            locs.forEach(l => locCounts[l] = (locCounts[l] || 0) + 1);
        });

        // Find max votes
        let maxVotes = 0;
        Object.values(locCounts).forEach(c => { if(c > maxVotes) maxVotes = c; });

        // Find all tie candidates
        const tieCandidates = Object.keys(locCounts).filter(k => locCounts[k] === maxVotes);

        // Pick random winner if tie
        let topLocation = '无';
        if (tieCandidates.length > 0) {
            // Seed with Today + MealType to ensure consistency across clients
            const seed = `${Helpers.getTodayDateString()}_${activeTab}`;
            topLocation = Helpers.pickRandomWithSeed(tieCandidates, seed);
        }

        return {
            totalVotes: data.length,
            topLocation,
            locCounts,
            isTie: tieCandidates.length > 1,
            tieCandidates
        };
    };

    const stats = calculateStats(currentVotes);
    
    // Formatting helper
    const formatMulti = (val) => {
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
                if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0].start) {
                    return parsed.map(t => t.end ? `${t.start}-${t.end}` : `${t.start}起`).join(', ');
                }
                return parsed.join(', ');
            }
            return val;
        } catch { return val; }
    };

    if (loading) {
        return (
            <Layout activePage="dashboard">
                <div className="mb-8 text-center animate-pulse">
                    <div className="w-48 h-8 bg-gray-200 mx-auto rounded mb-2"></div>
                    <div className="w-32 h-4 bg-gray-100 mx-auto rounded"></div>
                </div>
                <div className="flex justify-center mb-8 animate-pulse">
                    <div className="w-40 h-10 bg-gray-200 rounded-sm"></div>
                </div>
                <div className="grid grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
                    <div className="card h-28 bg-gray-50 animate-pulse border-none"></div>
                    <div className="card h-28 bg-gray-50 animate-pulse border-none"></div>
                </div>
                <div className="card h-80 bg-gray-50 animate-pulse border-none mb-8"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="card h-64 bg-gray-50 animate-pulse border-none"></div>
                    <div className="card h-64 bg-gray-50 animate-pulse border-none"></div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout activePage="dashboard">
             <div className="mb-8 text-center animate-fade-in-up">
                <h1 className="text-3xl font-bold text-[var(--primary-color)] tracking-widest">情报·看板</h1>
                <p className="text-gray-500 mt-2 text-xs tracking-wider border-t border-gray-300 inline-block pt-2">实时数据 · {Helpers.getTodayDateString()}</p>
            </div>

            <div className="flex justify-center mb-8 animate-fade-in-up">
                <div className="bg-gray-200 border border-gray-300 p-1 rounded-sm inline-flex">
                    {availableTabs.map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-2 rounded-sm text-sm font-medium transition-all
                                ${activeTab === tab 
                                    ? 'bg-white text-[var(--primary-color)] border border-gray-300 shadow-sm font-bold' 
                                    : 'text-gray-500 hover:text-gray-800'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {!stats ? (
                <div className="card text-center py-16 animate-fade-in-up delay-100">
                    <div className="icon-inbox text-4xl text-gray-300 mb-4 mx-auto"></div>
                    <p className="text-gray-500">{activeTab} 暂无数据</p>
                </div>
            ) : (
                <>
                    {/* Overview */}
                    <div className="grid grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8 animate-fade-in-up delay-100">
                        <div className="card bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-none relative">
                            <div className="relative z-10">
                                <div className="text-indigo-100 text-sm font-medium mb-1">{activeTab}参与人数</div>
                                <div className="text-4xl font-bold">{stats.totalVotes}</div>
                            </div>
                        </div>

                        <div className="card border-l-4 border-l-[var(--primary-color)]">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="icon-trophy text-[var(--primary-color)]"></div>
                                <div className="stat-label">今日膳房</div>
                            </div>
                            <div className="flex items-end gap-2">
                                <div className="stat-value text-2xl truncate" title={stats.topLocation}>
                                    {stats.topLocation}
                                </div>
                                {stats.isTie && (
                                    <span className="text-xs bg-yellow-100 text-yellow-800 px-1 rounded mb-1" title={`同票选项: ${stats.tieCandidates.join(', ')}`}>
                                        随机中选
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                                {stats.locCounts[stats.topLocation]} 票支持
                            </div>
                        </div>
                    </div>

                    {/* Time List */}
                    <div className="card mb-8 animate-fade-in-up delay-200">
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                            <div className="icon-clock text-[var(--primary-color)]"></div>
                            空闲时间分布
                        </h3>
                        {timeStats.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                <div className="icon-clock-4 text-3xl mb-2 opacity-50 mx-auto"></div>
                                <p className="text-sm">暂无时间数据</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {timeStats.map(stat => (
                                    <div key={stat.time} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:border-[var(--primary-color)] transition-colors">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="font-bold text-[var(--primary-color)] flex items-center gap-1.5">
                                                <div className="icon-clock text-sm"></div> {stat.time}
                                            </span>
                                            <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2 py-1 rounded-full border border-indigo-100">
                                                {stat.count} 人
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {stat.people.map((name, i) => (
                                                <span key={i} className="inline-flex items-center bg-gray-50 border border-gray-200 px-2 py-1 rounded text-xs text-gray-700">
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Lists */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in-up delay-300">
                        <div className="card">
                             <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                <div className="icon-list text-gray-500"></div>
                                报名列表
                            </h3>
                            <div className="space-y-3 pr-2">
                                {currentVotes.length === 0 ? (
                                    <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                                        <div className="icon-inbox text-4xl mb-2 opacity-50"></div>
                                        <p className="text-sm">暂无报名人员</p>
                                    </div>
                                ) : (
                                    [...currentVotes].reverse().map((vote, idx) => (
                                        <VoteItem 
                                            key={vote.objectId || idx} 
                                            vote={vote} 
                                            topLocation={stats?.topLocation} 
                                            formatMulti={formatMulti} 
                                        />
                                    ))
                                )}
                            </div>
                        </div>

                         {/* Location Stats */}
                        <div className="card">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                <div className="icon-chart-pie text-gray-500"></div>
                                地点投票统计
                            </h3>
                            <div className="space-y-2">
                                {Object.entries(stats.locCounts)
                                    .sort((a,b) => b[1] - a[1])
                                    .map(([loc, count]) => (
                                    <div key={loc} className="relative pt-1">
                                        <div className="flex justify-between mb-1 text-xs">
                                            <span className={`font-medium ${loc === stats.topLocation ? 'text-[var(--primary-color)]' : ''}`}>
                                                {loc} {loc === stats.topLocation && '👑'}
                                            </span>
                                            <span className="font-semibold">{count}票</span>
                                        </div>
                                        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-100">
                                            <div style={{ width: `${(count / stats.totalVotes) * 100}%` }} className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500 ${loc === stats.topLocation ? 'bg-[var(--primary-color)]' : 'bg-gray-400'}`}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </Layout>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <DashboardApp />
  </ErrorBoundary>
);