const apiKeyAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const expectedApiKey = process.env.GENERATOR_API_KEY;

    if (!expectedApiKey) {
        console.error("GENERATOR_API_KEY is not set in the environment.");
        return res.status(500).json({ message: 'Server configuration error: API key not set.' });
    }

    if (!apiKey || apiKey !== expectedApiKey) {
        console.warn(`Unauthorized access attempt. Provided API key: ${apiKey}`);
        return res.status(401).json({ message: 'Unauthorized: Invalid or missing API Key.' });
    }

    next();
};

export default apiKeyAuth;
