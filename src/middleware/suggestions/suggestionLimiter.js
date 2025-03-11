const rateLimit = require('express-rate-limit');


const suggestionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each user to 5 suggestions per window
    message: 'Too many suggestions submitted, please try again later'

})

export default suggestionLimiter;