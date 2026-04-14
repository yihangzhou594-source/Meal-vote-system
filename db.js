// Wrapper for Trickle Database Operations

const DB_TABLES = {
    SETTINGS: 'meal_settings',
    VOTES: 'meal_votes',
    METADATA: 'system_metadata',
    REVIEWS: 'meal_reviews',
    SUMMARIES: 'merchant_ai_summaries',
    CONSUMPTION: 'meal_costs'
};

const DB = {
    // Internal cache for reviews
    _reviewCache: {
        data: null,
        timestamp: 0,
        TTL: 5 * 60 * 1000 // 5 minutes
    },

    // Generic retry wrapper for any async operation
    async withRetry(operation, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try {
                if (i > 0) {
                    const jitter = Math.random() * 500;
                    await new Promise(resolve => setTimeout(resolve, (delay * Math.pow(2, i - 1)) + jitter));
                }
                
                if (typeof operation !== 'function') {
                    throw new Error('Operation is not a function');
                }

                return await operation();
            } catch (err) {
                let msg = err && err.toString ? err.toString() : 'Unknown Error';
                // Remove duplicated Error prefixes if any
                msg = msg.replace(/^Error:\s*Error:\s*/, 'Error: ');

                const isPermissionError = msg.includes("NoPermission") || msg.includes("Permission denied");
                const isFetchError = msg.includes("Failed to fetch") || msg.includes("NetworkError");
                
                if (isPermissionError) {
                    console.warn("[DB] Permission denied. Operation gracefully aborted.");
                    return null; 
                }

                if (i < retries - 1) {
                     if (!isFetchError) {
                         console.warn(`[DB] Retry ${i+1}/${retries} failed: ${msg}`);
                     }
                }

                if (i === retries - 1) {
                    if (isFetchError) {
                         console.warn("[DB] Network request blocked or failed (Failed to fetch). Using graceful fallback.");
                    } else {
                         console.warn("[DB] Operation failed after all retries:", msg);
                    }
                    return null;
                }
            }
        }
        return null; 
    },

    // Helper for safe pagination fetching
    async fetchAllObjects(tableName, maxLimit = 1000, stopCondition = null) {
        let allItems = [];
        let nextPageToken = undefined;
        let pageCount = 0;
        
        if (typeof trickleListObjects === 'undefined') {
            console.warn('[DB] trickleListObjects API is not available, skipping fetch.');
            return [];
        }

        do {
            try {
                if (pageCount > 0) await new Promise(resolve => setTimeout(resolve, 200));

                const res = await this.withRetry(() => {
                    return nextPageToken && typeof nextPageToken === 'string'
                        ? trickleListObjects(tableName, 10, true, nextPageToken)
                        : trickleListObjects(tableName, 10, true, undefined);
                });
                
                if (!res) break; 

                if (res && Array.isArray(res.items)) {
                    allItems = allItems.concat(res.items);
                    if (stopCondition && stopCondition(res.items)) break;
                } else {
                    break;
                }
                
                nextPageToken = (res && res.nextPageToken) ? res.nextPageToken : null;
                pageCount++;
                
                if (allItems.length >= maxLimit || pageCount > 50) break;
            } catch (err) {
                console.warn(`[DB] Fetch pagination error: ${err}`);
                break;
            }
        } while (nextPageToken);
        
        return allItems;
    },

    // Metadata Operations
    async getSystemMetadata() {
        if (typeof trickleListObjects === 'undefined') return null;
        try {
            const res = await this.fetchAllObjects(DB_TABLES.METADATA);
            if (!res || res.length === 0) return null;
            return res.find(i => i.objectData.config_key === 'global') || null;
        } catch (e) {
            return null;
        }
    },

    async saveSystemMetadata(data) {
        try {
            const existing = await this.getSystemMetadata();
            const payload = {
                config_key: 'global',
                announcement: JSON.stringify(data.announcement || {}),
                location_registry: JSON.stringify(data.location_registry || {})
            };
            
            return await this.withRetry(async () => {
                if (existing) {
                    return await trickleUpdateObject(DB_TABLES.METADATA, existing.objectId, payload);
                } else {
                    return await trickleCreateObject(DB_TABLES.METADATA, payload);
                }
            });
        } catch (e) {
            return null;
        }
    },

    // Settings Operations
    async getSettings(dateStr) {
        const createFallback = (date) => ({
            objectData: {
                config_date: date,
                locations: JSON.stringify(['员工餐厅', '特色小炒', '轻食沙拉']),
                times: JSON.stringify([]),
                meal_types: JSON.stringify(['午饭', '晚饭']),
                meal_status: JSON.stringify({}),
                location_links: '{}',
                location_descriptions: '{}'
            },
            isFallback: true
        });

        if (typeof trickleListObjects === 'undefined') {
            return createFallback(dateStr);
        }

        try {
            const res = await this.withRetry(() => 
                trickleListObjects(DB_TABLES.SETTINGS, 10, true, undefined)
            );
            
            if (!res || !res.items) {
                return createFallback(dateStr);
            }
            
            const todayConfig = res.items.find(item => item.objectData.config_date === dateStr);
            return todayConfig || null;
        } catch (error) {
            return createFallback(dateStr);
        }
    },

    async getLatestConfig() {
        if (typeof trickleListObjects === 'undefined') return null;
        try {
            const res = await this.withRetry(() => 
                trickleListObjects(DB_TABLES.SETTINGS, 1, true, undefined)
            );
            if (res && res.items && res.items.length > 0) {
                return res.items[0];
            }
            return null;
        } catch (error) {
            return null;
        }
    },

    async saveSettings(settingsData) {
        try {
            let existing = null;
            try { existing = await this.getSettings(settingsData.config_date); } catch (e) {}
            
            if (existing && (existing.isFallback || !existing.objectId)) existing = null;

            const payload = {
                config_date: settingsData.config_date,
                locations: JSON.stringify(settingsData.locations),
                times: JSON.stringify(settingsData.times),
                meal_types: JSON.stringify(settingsData.meal_types),
                location_links: JSON.stringify(settingsData.location_links || {}),
                location_descriptions: JSON.stringify(settingsData.location_descriptions || {}),
                meal_status: JSON.stringify(settingsData.meal_status || {})
            };

            return await this.withRetry(async () => {
                if (existing) {
                    return await trickleUpdateObject(DB_TABLES.SETTINGS, existing.objectId, payload);
                } else {
                    return await trickleCreateObject(DB_TABLES.SETTINGS, payload);
                }
            });
        } catch (e) {
            return null;
        }
    },

    // Votes Operations
    async getVotes(dateStr, forceRefresh = false) {
        const CACHE_KEY = `trickle_votes_cache_${dateStr}`;
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

        // Check Cache
        if (!forceRefresh) {
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const { data, timestamp } = JSON.parse(cached);
                    if (Date.now() - timestamp < CACHE_TTL) {
                        return data;
                    }
                }
            } catch (e) {
                // Ignore cache errors
            }
        }

        try {
            const stopCondition = (pageItems) => {
                if (!pageItems || pageItems.length === 0) return true;
                const lastItem = pageItems[pageItems.length - 1];
                return lastItem.objectData.vote_date < dateStr;
            };

            const allItems = await this.fetchAllObjects(DB_TABLES.VOTES, 500, stopCondition);
            
            let result = [];
            if (allItems) {
                result = allItems.filter(item => 
                    item.objectData.vote_date === dateStr && 
                    !item.objectData.is_deleted
                );
            }

            // Update Cache
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    data: result,
                    timestamp: Date.now()
                }));
            } catch (e) {
                // Ignore
            }

            return result;
        } catch (error) {
            return [];
        }
    },
    
    // Clear vote cache to force fresh fetch
    resetVoteCache() {
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('trickle_votes_cache_')) {
                    localStorage.removeItem(key);
                }
            });
            // Also invalidate review cache
            this._reviewCache.data = null;
        } catch (e) {
            console.warn('[DB] Failed to clear vote cache', e);
        }
    },

    async getAllVotes() {
        try {
            const allItems = await this.fetchAllObjects(DB_TABLES.VOTES, 1000) || [];
            return allItems.filter(item => !item.objectData.is_deleted);
        } catch (error) {
            return [];
        }
    },

    async submitVote(voteData) {
        try {
            const payload = {
                ...voteData,
                location: Array.isArray(voteData.location) ? JSON.stringify(voteData.location) : voteData.location,
                time: Array.isArray(voteData.time) ? JSON.stringify(voteData.time) : voteData.time,
                is_auto: false,
                is_deleted: false
            };
            return await this.withRetry(() => trickleCreateObject(DB_TABLES.VOTES, payload));
        } catch (e) {
            return null;
        }
    },

    async deleteVote(voteId) {
        try {
            const existing = await this.withRetry(() => trickleGetObject(DB_TABLES.VOTES, voteId));
            if (!existing) return null;
            const newData = { ...existing.objectData, is_deleted: true };
            return await this.withRetry(() => trickleUpdateObject(DB_TABLES.VOTES, voteId, newData));
        } catch (e) {
            console.warn('Delete (Soft) failed', e);
            return null;
        }
    },

    // Review Operations
    async getReviews(location = null) {
        // Check In-Memory Cache
        const now = Date.now();
        if (this._reviewCache.data && (now - this._reviewCache.timestamp < this._reviewCache.TTL)) {
            let cachedData = this._reviewCache.data;
            if (location) {
                cachedData = cachedData.filter(r => r.objectData.location === location);
            }
            return cachedData;
        }

        try {
            const allReviews = await this.fetchAllObjects(DB_TABLES.REVIEWS, 500);
            if (!allReviews) return [];
            
            let filtered = allReviews.filter(r => !r.objectData.is_deleted);
            
            // Sort by date desc
            const sortedReviews = filtered.sort((a, b) => 
                new Date(b.objectData.review_date) - new Date(a.objectData.review_date)
            );

            // Update Cache
            this._reviewCache.data = sortedReviews;
            this._reviewCache.timestamp = now;
            
            if (location) {
                return sortedReviews.filter(r => r.objectData.location === location);
            }

            return sortedReviews;
        } catch (e) {
            console.warn('Failed to get reviews', e);
            return [];
        }
    },

    async addReview(reviewData) {
        try {
            const payload = {
                ...reviewData,
                is_deleted: false,
                review_date: reviewData.review_date || Helpers.getTodayDateString()
            };
            // Invalidate cache
            this._reviewCache.data = null;
            return await this.withRetry(() => trickleCreateObject(DB_TABLES.REVIEWS, payload));
        } catch (e) {
            console.warn('Failed to add review', e);
            return null;
        }
    },

    async updateReview(reviewId, reviewData) {
        try {
            // Invalidate cache
            this._reviewCache.data = null;
            return await this.withRetry(() => trickleUpdateObject(DB_TABLES.REVIEWS, reviewId, reviewData));
        } catch (e) {
            console.warn('Failed to update review', e);
            return null;
        }
    },

    async deleteReview(reviewId) {
        try {
            // Invalidate cache
            this._reviewCache.data = null;
            const existing = await this.withRetry(() => trickleGetObject(DB_TABLES.REVIEWS, reviewId));
            if (!existing) return null;
            // Soft delete
            const newData = { ...existing.objectData, is_deleted: true };
            return await this.withRetry(() => trickleUpdateObject(DB_TABLES.REVIEWS, reviewId, newData));
        } catch (e) {
            console.warn('Failed to delete review', e);
            return null;
        }
    },

    async getReviewStats() {
        try {
            const reviews = await this.getReviews();
            const stats = {}; // { LocationName: { count: 10, sum: 45, avg: 4.5 } }
            
            reviews.forEach(r => {
                const loc = r.objectData.location;
                const rating = Number(r.objectData.rating) || 0;
                
                if (!stats[loc]) stats[loc] = { count: 0, sum: 0 };
                stats[loc].count += 1;
                stats[loc].sum += rating;
            });

            Object.keys(stats).forEach(loc => {
                stats[loc].avg = (stats[loc].sum / stats[loc].count).toFixed(1);
            });

            return stats;
        } catch (e) {
            return {};
        }
    },

    // Consumption Operations
    async addConsumption(data) {
        try {
            const payload = {
                ...data,
                is_deleted: false,
                date: data.date || Helpers.getTodayDateString()
            };
            return await this.withRetry(() => trickleCreateObject(DB_TABLES.CONSUMPTION, payload));
        } catch (e) {
            console.warn('Failed to add consumption', e);
            return null;
        }
    },

    async getConsumptionStats() {
        try {
            const allItems = await this.fetchAllObjects(DB_TABLES.CONSUMPTION, 1000);
            if (!allItems) return {};

            const activeItems = allItems.filter(i => !i.objectData.is_deleted);
            const locGroups = {};

            // Group by location
            activeItems.forEach(item => {
                const loc = item.objectData.location;
                const amt = Number(item.objectData.amount);
                if (!isNaN(amt) && amt > 0) {
                    if (!locGroups[loc]) locGroups[loc] = [];
                    locGroups[loc].push(amt);
                }
            });

            const stats = {};
            // Calculate Trimmed Mean (remove min and max if length > 2)
            Object.keys(locGroups).forEach(loc => {
                const prices = locGroups[loc].sort((a, b) => a - b);
                let finalPrices = prices;
                
                // Trim logic: if > 2 samples, remove top 1 and bottom 1
                if (prices.length > 2) {
                    finalPrices = prices.slice(1, -1);
                }

                const sum = finalPrices.reduce((a, b) => a + b, 0);
                const avg = sum / finalPrices.length;
                
                stats[loc] = {
                    avg: Math.round(avg), // Round to integer for cleaner display
                    count: prices.length, // Total samples count (before trim)
                    min: prices[0],
                    max: prices[prices.length - 1]
                };
            });

            return stats;
        } catch (e) {
            console.warn('Failed to get consumption stats', e);
            return {};
        }
    },

    // AI Summary Operations
    async getOrUpdateMerchantSummary(locationName) {
        try {
            // 1. Check existing summary
            let summaryObj = null;
            try {
                // Fetch all summaries and find matching (since we can't query by field easily without ID)
                // Assuming low volume of locations, fetch all is fine. 
                // Optimization: In real app, we might use a predictable ID or query.
                const allSummaries = await this.fetchAllObjects(DB_TABLES.SUMMARIES);
                const locSummaries = allSummaries.filter(s => s.objectData.location_name === locationName);
                if (locSummaries.length > 0) {
                    locSummaries.sort((a, b) => new Date(b.objectData.last_updated || 0) - new Date(a.objectData.last_updated || 0));
                    summaryObj = locSummaries[0];
                }
            } catch (e) {
                console.warn('Failed to fetch summaries', e);
            }

            const now = new Date();
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            
            let needsUpdate = false;
            if (!summaryObj) {
                needsUpdate = true;
            } else {
                const lastUpdated = new Date(summaryObj.objectData.last_updated);
                if ((now - lastUpdated) > sevenDaysMs) {
                    needsUpdate = true;
                }
            }

            if (!needsUpdate) {
                return summaryObj.objectData.summary;
            }

            // 2. Check for new reviews before generating
            const reviews = await this.getReviews(locationName);
            if (!reviews || reviews.length === 0) {
                return "该商户暂无评价数据。";
            }

            // If we have an existing summary, check if there are any reviews newer than the last update
            if (summaryObj) {
                const lastUpdateDate = new Date(summaryObj.objectData.last_updated);
                const hasNewReviews = reviews.some(r => {
                    const rDate = new Date(r.objectData.review_date);
                    // Compare dates. If review date is after last update date.
                    return rDate > lastUpdateDate;
                });

                if (!hasNewReviews) {
                    // No new reviews, skip AI generation to save resources
                    // We DO NOT update the timestamp here, so it will be checked again next time (after cooldown if we updated timestamp, or immediately if we didn't)
                    // But since we are inside "needsUpdate" (which means > 7 days), if we don't update timestamp, 
                    // it will check this logic every time. This is acceptable (cheap DB check vs expensive AI).
                    // Returning existing summary.
                    return summaryObj.objectData.summary;
                }
            }

            // 3. Generate New Summary
            const newSummaryText = await AIService.generateSummary(locationName, reviews);

            // 4. Save to DB
            const payload = {
                location_name: locationName,
                summary: newSummaryText,
                last_updated: now.toISOString()
            };

            await this.withRetry(async () => {
                if (summaryObj) {
                    return await trickleUpdateObject(DB_TABLES.SUMMARIES, summaryObj.objectId, payload);
                } else {
                    return await trickleCreateObject(DB_TABLES.SUMMARIES, payload);
                }
            });

            return newSummaryText;

        } catch (e) {
            console.warn('Error in getOrUpdateMerchantSummary', e);
            return "无法获取AI总结。";
        }
    },

    // --- Cleanup Operations ---
    async scanCleanupData() {
        try {
            const todayStr = Helpers.getTodayDateString();
            const past7Str = Helpers.getPastDateString(7);
            
            const [allVotes, allSummaries] = await Promise.all([
                this.fetchAllObjects(DB_TABLES.VOTES, 5000),
                this.fetchAllObjects(DB_TABLES.SUMMARIES, 1000)
            ]);

            const obsoleteVotes = [];
            const userVoteMap = {};
            
            if (allVotes) {
                // Sort descending to keep newest
                allVotes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                
                allVotes.forEach(v => {
                    const data = v.objectData;
                    if (data.is_deleted) {
                        obsoleteVotes.push({ id: v.objectId, table: DB_TABLES.VOTES, type: '投票', reason: '已软删除的记录', detail: `${data.nickname} - ${data.vote_date}` });
                        return;
                    }
                    if (data.vote_date < todayStr) {
                        obsoleteVotes.push({ id: v.objectId, table: DB_TABLES.VOTES, type: '投票', reason: '过期历史数据', detail: `${data.nickname} - ${data.vote_date}` });
                        return;
                    }
                    if (data.vote_date === todayStr) {
                        const key = `${data.nickname}_${data.meal_type}`;
                        if (userVoteMap[key]) {
                            obsoleteVotes.push({ id: v.objectId, table: DB_TABLES.VOTES, type: '投票', reason: '今日重复报名', detail: `${data.nickname} - ${data.meal_type}` });
                        } else {
                            userVoteMap[key] = true;
                        }
                    }
                });
            }

            const obsoleteSummaries = [];
            if (allSummaries) {
                // Sort descending to ensure we see the newest summary for a location first
                allSummaries.sort((a, b) => new Date(b.objectData.last_updated || 0) - new Date(a.objectData.last_updated || 0));
                const locationLatestMap = {};

                allSummaries.forEach(s => {
                    const data = s.objectData;
                    const locName = data.location_name;
                    const updatedDate = data.last_updated ? data.last_updated.substring(0, 10) : '';
                    
                    if (!locationLatestMap[locName]) {
                        // The first one encountered is the latest, so we keep it
                        locationLatestMap[locName] = s;
                    } else {
                        // This is an older summary. We can delete it if it's also > 7 days old.
                        if (updatedDate < past7Str) {
                            obsoleteSummaries.push({ 
                                id: s.objectId, 
                                table: DB_TABLES.SUMMARIES, 
                                type: 'AI总结', 
                                reason: '已被新总结覆盖且已超7天', 
                                detail: `${data.location_name} (${updatedDate})` 
                            });
                        }
                    }
                });
            }

            return { votes: obsoleteVotes, summaries: obsoleteSummaries };
        } catch (e) {
            console.warn('Scan cleanup failed', e);
            return { votes: [], summaries: [] };
        }
    },

    async executeCleanup(items) {
        let successCount = 0;
        for (const item of items) {
            try {
                await trickleDeleteObject(item.table, item.id);
                successCount++;
            } catch (e) {
                console.warn('Failed to delete object', item.id);
            }
        }
        return successCount;
    }
};

window.DB = DB;
