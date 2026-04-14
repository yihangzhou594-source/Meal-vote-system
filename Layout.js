function Layout({ children, activePage }) {
    return (
        <div className="min-h-screen flex flex-col bg-[var(--bg-color)] text-[var(--text-main)] font-sans">
            <Header activePage={activePage} />
            
            <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl relative z-10">
                {children}
            </main>

            {/* Mascot Character (Fixed Bottom Left) */}
            <div className="fixed bottom-0 left-4 z-0 pointer-events-none hidden xl:block opacity-90">
                <img 
                    src="https://app.trickle.so/storage/public/images/usr_1a810ecaf8000001/c0921e22-7519-441a-b085-149eaedd50d8.png" 
                    alt="Character" 
                    className="w-64 h-auto object-contain drop-shadow-xl"
                    style={{ maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)' }}
                />
            </div>
            
            <footer className="py-6 text-center text-gray-500 text-xs font-serif tracking-widest uppercase relative z-10 bg-gradient-to-t from-white/80 to-transparent">
                <div className="flex justify-center items-center gap-3 mb-2">
                    <span className="w-12 h-px bg-[#d4af37]"></span>
                    <span className="text-[#1e293b] font-bold">罗德岛·后勤部</span>
                    <span className="w-12 h-px bg-[#d4af37]"></span>
                </div>
                <p>&copy; {new Date().getFullYear()} Rhodes Island Logistics · Powered by Trickle</p>
            </footer>
        </div>
    );
}