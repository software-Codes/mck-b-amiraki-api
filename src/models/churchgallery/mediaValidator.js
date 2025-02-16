const {body, param } = require('express-validator');

const mediaUploadValidator = [
    body('title').trim().notEmpty().withMessage('Title is required')
      .isLength({ max: 255 }).withMessage('Title must be less than 255 characters'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('contentType').isIn(['image', 'video']).withMessage('Invalid content type')
  ];



  const mediaIdValidator  = [
    param('id').isUUID().withMessage('Invalid media ID')

  ]

    module.exports = {
        mediaUploadValidator,
        mediaIdValidator
    }