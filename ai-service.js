const AIService = {
    async generateSummary(locationName, reviews) {
        if (!reviews || reviews.length === 0) {
            return "暂无评价数据，无法生成总结。";
        }

        const reviewsText = reviews.map(r => 
            `- 评分: ${r.objectData.rating}星 | 内容: ${r.objectData.content || '无内容'}`
        ).join('\n');

        const systemPrompt = "你是一个专业的餐饮点评助手。请根据以下关于餐厅的用户评价，生成一份简明扼要的商户评价总结。总结应包含：口味特点、服务质量、以及综合推荐指数。字数控制在100字以内。";
        
        const userPrompt = `餐厅名称：“${locationName}”\n\n用户评价列表：\n${reviewsText}`;

        try {
            if (typeof invokeAIAgent !== 'function') {
                console.warn('invokeAIAgent is not available in this environment.');
                return "当前环境不支持 AI 总结功能。";
            }
            const summary = await invokeAIAgent(systemPrompt, userPrompt);
            return summary;
        } catch (error) {
            console.warn('Failed to generate summary:', error);
            return "AI 总结生成失败，请稍后重试。";
        }
    }
};

window.AIService = AIService;
