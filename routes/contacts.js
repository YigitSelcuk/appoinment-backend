const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/security');
const upload = require('../middleware/upload');
const {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  getCategories,
  getCategoriesWithStats,
  getAllCategoriesForDropdown,
  createCategory,
  updateCategory,
  deleteCategory,
  moveContactsBetweenCategories,
  checkTCExists,
  sendBulkSMSByCategories
} = require('../controllers/contactsController');

// Tüm route'lar için authentication gerekli
router.use(authenticateToken);

// Kategoriler (spesifik route'lar önce gelmelidir)
router.get('/categories-stats', getCategoriesWithStats);
router.get('/categories-all', getAllCategoriesForDropdown);
router.put('/move-category', moveContactsBetweenCategories);
router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// TC Kimlik No kontrolü
router.get('/check-tc/:tc_no', checkTCExists);

// SMS işlemleri
router.post('/send-bulk-sms', sendBulkSMSByCategories);

// Kişiler
router.get('/', getContacts);
router.get('/:id', getContact);
router.post('/', upload.single('avatar'), createContact); // Resim yükleme desteği
router.put('/:id', updateContact);
router.delete('/:id', deleteContact);

module.exports = router;