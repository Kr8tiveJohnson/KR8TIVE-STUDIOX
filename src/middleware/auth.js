const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Authentication required.');
    }
    
    try {
        const authParts = authHeader.split(' ');
        if (authParts.length < 2 || authParts[0].toLowerCase() !== 'basic') {
            return res.status(401).send('Invalid auth header.');
        }
        
        const credentials = Buffer.from(authParts[1], 'base64').toString().split(':');
        if (credentials.length < 2) {
            return res.status(401).send('Invalid auth structure.');
        }
        
        const user = credentials[0];
        const pass = credentials[1];
        
        if (user === 'kr8tiveadmin' && pass === 'studix2026') {
            next();
        } else {
            res.status(401).send('Invalid credentials.');
        }
    } catch (err) {
        console.error("Auth parsing error:", err);
        res.status(401).send('Authentication failed.');
    }
};

module.exports = auth;
