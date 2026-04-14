function LocationInfoModal({ location, description, link, stats, cost, onClose }) {
    if (!location) return null;
    
    const [aiSummary, setAiSummary] = React.useState(null);
    const [loadingAi, setLoadingAi] = React.useState(false);

    React.useEffect(() => {
        let mounted = true;
        const fetchSummary = async () => {
            setLoadingAi(true);
            try {
                const text = await DB.getOrUpdateMerchantSummary(location);
                if (mounted) setAiSummary(text);
            } catch (e) {
                if (mounted) setAiSummary("无法获取AI总结");
            } finally {
                if (mounted) setLoadingAi(false);
            }
        };
        fetchSummary();
        return () => { mounted = false; };
    }, [location]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all animate-scale-in flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 text-white flex justify-between items-center flex-shrink-0">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <div className="icon-store text-xl"></div>
                        {location}
                    </h3>
                    <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                        <div className="icon-x text-lg"></div>
                    </button>
                </div>
                
                <div className="p-5 overflow-y-auto">
                    <div className="flex gap-4 mb-6">
                        {/* Rating Stats */}
                        {stats && (
                            <div className="flex-1 flex items-center gap-2 bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                                <div className="text-center px-2 border-r border-yellow-200 min-w-[60px]">
                                    <div className="text-xl font-bold text-yellow-600 leading-none">{stats.avg || '-'}</div>
                                    <div className="text-[10px] text-yellow-500 uppercase font-bold mt-1">Rating</div>
                                </div>
                                <div>
                                    <div className="flex text-yellow-400 text-xs mb-1">
                                        {[1,2,3,4,5].map(i => (
                                            <div key={i} className={`icon-star ${i <= Math.round(stats.avg || 0) ? 'fill-yellow-400' : 'text-gray-300'}`}></div>
                                        ))}
                                    </div>
                                    <div className="text-[10px] text-gray-500">
                                        {stats.count || 0} 人评价
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Cost Stats */}
                        {cost && (
                             <div className="flex-1 flex items-center gap-2 bg-green-50 p-3 rounded-lg border border-green-100">
                                <div className="text-center px-2 border-r border-green-200 min-w-[60px]">
                                    <div className="text-xl font-bold text-green-700 leading-none">¥{cost.avg}</div>
                                    <div className="text-[10px] text-green-600 uppercase font-bold mt-1">Avg. Cost</div>
                                </div>
                                <div className="text-[10px] text-gray-500 leading-tight">
                                    人均消费
                                    <br/>
                                    (样本: {cost.count})
                                </div>
                            </div>
                        )}
                        {!cost && (
                             <div className="flex-1 flex items-center justify-center bg-gray-50 p-3 rounded-lg border border-gray-100 text-gray-400 text-xs">
                                暂无人均数据
                            </div>
                        )}
                    </div>

                    {/* AI Summary Section */}
                    <div className="mb-6">
                         <div className="flex items-center gap-2 mb-2">
                            <div className="icon-sparkles text-purple-500"></div>
                            <span className="font-bold text-sm text-gray-700">AI 评价总结 (每周更新)</span>
                         </div>
                         <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 text-sm text-gray-700 relative min-h-[80px]">
                            {loadingAi ? (
                                <div className="flex items-center justify-center h-full py-4 text-purple-400 gap-2">
                                    <div className="icon-loader animate-spin"></div>
                                    <span>正在分析干员情报...</span>
                                </div>
                            ) : (
                                <div className="leading-relaxed whitespace-pre-wrap">
                                    {aiSummary || '暂无总结数据'}
                                </div>
                            )}
                         </div>
                    </div>

                    <div className="prose prose-sm text-gray-600 mb-6">
                        <h4 className="font-bold text-gray-800 mb-2 text-xs uppercase tracking-wider">商户简介</h4>
                        {description ? (
                            <div className="whitespace-pre-line leading-relaxed">{description}</div>
                        ) : (
                            <div className="text-gray-400 italic py-2">暂无商户简介</div>
                        )}
                    </div>

                    <div className="space-y-2">
                         {link && (
                            <a 
                                href={link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="btn btn-outline w-full flex items-center justify-center gap-2 py-2 text-sm"
                            >
                                <div className="icon-external-link text-sm"></div>
                                查看外部详情/点评
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
