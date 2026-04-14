function Alert({ type = 'info', message, onClose }) {
    if (!message) return null;

    const styles = {
        info: 'bg-blue-50 text-blue-800 border-blue-200',
        success: 'bg-green-50 text-green-800 border-green-200',
        error: 'bg-red-50 text-red-800 border-red-200',
        warning: 'bg-yellow-50 text-yellow-800 border-yellow-200'
    };
    
    const icons = {
        info: 'icon-info',
        success: 'icon-circle-check',
        error: 'icon-circle-alert',
        warning: 'icon-triangle-alert'
    };

    return (
        <div className={`p-4 rounded-lg border flex items-start gap-3 ${styles[type]} mb-4 animate-fade-in`}>
            <div className={`${icons[type]} mt-0.5 text-lg`}></div>
            <div className="flex-grow text-sm">{message}</div>
            {onClose && (
                <button onClick={onClose} className="hover:opacity-70">
                    <div className="icon-x text-lg"></div>
                </button>
            )}
        </div>
    );
}