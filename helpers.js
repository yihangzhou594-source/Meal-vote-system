const Helpers = {
    getTodayDateString: () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    getPastDateString: (daysAgo) => {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    
    // Safely parse JSON with fallback
    safeJsonParse: (str, fallback = []) => {
        try {
            return JSON.parse(str);
        } catch (e) {
            return fallback;
        }
    },

    // Deterministic random picker based on string seed (e.g., date)
    pickRandomWithSeed: (options, seed) => {
        if (!options || options.length === 0) return null;
        if (options.length === 1) return options[0];
        
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = seed.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const index = Math.abs(hash) % options.length;
        return options[index];
    }
};

window.Helpers = Helpers;