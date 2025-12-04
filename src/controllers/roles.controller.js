const { getAllRoles } = require('../models/usuarios.model');

async function listRolesController(req, res) {
  try {
    const roles = await getAllRoles();
    return res.json(roles);
  } catch (err) {
    console.error('Error listando roles:', err);
    return res.status(500).json({ error: 'Error listando roles' });
  }
}

module.exports = { listRolesController };
