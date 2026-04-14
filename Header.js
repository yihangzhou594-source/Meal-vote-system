function Header({ activePage }) {
    const navItems = [
        { id: 'home', label: '我要报名', href: 'index.html', icon: 'icon-utensils' },
        { id: 'dashboard', label: '实时结果', href: 'dashboard.html', icon: 'icon-chart-bar' },
        { id: 'reviews', label: '评价反馈', href: 'reviews.html', icon: 'icon-message-square-heart' },
        { id: 'admin', label: '管理设置', href: 'admin.html', icon: 'icon-settings' },
    ];

    return (
        <header className="relative border-b border-gray-200 sticky top-0 z-50 shadow-md h-20 overflow-hidden">
            {/* Asset Background */}
            <div 
                className="absolute inset-0 z-0 bg-cover bg-center opacity-40 grayscale-[20%]"
                style={{ backgroundImage: "var(--header-bg-img)" }}
            ></div>
            {/* White Gradient Overlay to ensure text readability */}
            <div className="absolute inset-0 z-0 bg-gradient-to-r from-white via-white/90 to-transparent"></div>
            
            <div className="container mx-auto px-2 md:px-4 h-full flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-sm bg-[#1e293b] flex items-center justify-center text-[#d4af37] shadow-lg border-2 border-[#d4af37] shrink-0">
                        <div className="icon-utensils text-xl md:text-2xl"></div>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-xl md:text-3xl text-[#1e293b] tracking-wider" style={{textShadow: '0 1px 0 rgba(255,255,255,0.8)'}}>
                            罗德岛·食堂
                        </span>
                        <span className="text-[8px] md:text-[10px] tracking-[0.1em] md:tracking-[0.3em] uppercase text-gray-500 font-bold whitespace-nowrap">Rhodes Island Kitchen</span>
                    </div>
                </div>
                
                <nav className="hidden md:flex items-center gap-2">
                    {navItems.map(item => (
                        <a 
                            key={item.id}
                            href={item.href}
                            className={`px-5 py-2 rounded-sm text-sm font-bold transition-all flex items-center gap-2 relative overflow-hidden group border border-transparent
                                ${activePage === item.id 
                                    ? 'text-[#1e293b] bg-white/80 border-gray-200 shadow-sm' 
                                    : 'text-gray-600 hover:text-[#1e293b] hover:bg-white/50'}`}
                        >
                            <div className={`${item.icon} text-lg ${activePage === item.id ? 'text-[#d4af37]' : 'text-gray-400'}`}></div>
                            {item.label}
                            {activePage === item.id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#d4af37]"></div>}
                        </a>
                    ))}
                </nav>

                {/* Mobile Menu */}
                <div className="md:hidden flex gap-1 overflow-x-auto no-scrollbar pb-1">
                    {navItems.map(item => (
                        <a 
                            key={item.id}
                            href={item.href}
                            className={`px-2 py-1.5 rounded-sm backdrop-blur-sm flex flex-col items-center justify-center min-w-[3.5rem] ${activePage === item.id ? 'text-[#1e293b] bg-white/90 shadow-sm border border-gray-200' : 'text-gray-600'}`}
                            title={item.label}
                        >
                             <div className={`${item.icon} text-lg mb-0.5 ${activePage === item.id ? 'text-[#d4af37]' : 'opacity-70'}`}></div>
                             <span className="text-[9px] font-bold tracking-wider">{item.label.substring(0,2)}</span>
                        </a>
                    ))}
                </div>
            </div>
        </header>
    );
}