const NotificacionesModel = require('../models/notificaciones.model');

/**
 * Obtener notificaciones del usuario autenticado
 */
exports.obtenerMisNotificaciones = async (req, res) => {
    try {
        const id_usuario = req.user?.id_usuario;

        if (!id_usuario) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const notificaciones = await NotificacionesModel.obtenerNotificacionesUsuario(id_usuario);
        const noLeidas = await NotificacionesModel.contarNoLeidas(id_usuario);

        res.json({
            success: true,
            notificaciones,
            total_no_leidas: noLeidas
        });
    } catch (error) {
        console.error('Error obteniendo notificaciones:', error);
        res.status(500).json({
            error: 'Error obteniendo notificaciones',
            details: error.message
        });
    }
};

/**
 * Marcar una notificación como leída
 */
exports.marcarComoLeida = async (req, res) => {
    try {
        const { id_notificacion } = req.params;
        const id_usuario = req.user?.id_usuario;

        if (!id_usuario) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        // Verificar que la notificación pertenece al usuario
        const notificaciones = await NotificacionesModel.obtenerNotificacionesUsuario(id_usuario);
        const notificacion = notificaciones.find(n => n.id_notificacion === parseInt(id_notificacion));

        if (!notificacion) {
            return res.status(404).json({ error: 'Notificación no encontrada' });
        }

        await NotificacionesModel.marcarComoLeida(id_notificacion);

        res.json({
            success: true,
            message: 'Notificación marcada como leída'
        });
    } catch (error) {
        console.error('Error marcando notificación como leída:', error);
        res.status(500).json({
            error: 'Error marcando notificación como leída',
            details: error.message
        });
    }
};

/**
 * Marcar todas las notificaciones del usuario como leídas
 */
exports.marcarTodasComoLeidas = async (req, res) => {
    try {
        const id_usuario = req.user?.id_usuario;

        if (!id_usuario) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const cantidadActualizada = await NotificacionesModel.marcarTodasComoLeidas(id_usuario);

        res.json({
            success: true,
            message: `${cantidadActualizada} notificaciones marcadas como leídas`,
            cantidad_actualizada: cantidadActualizada
        });
    } catch (error) {
        console.error('Error marcando todas las notificaciones como leídas:', error);
        res.status(500).json({
            error: 'Error marcando notificaciones como leídas',
            details: error.message
        });
    }
};

/**
 * Obtener cantidad de notificaciones no leídas
 */
exports.contarNoLeidas = async (req, res) => {
    try {
        const id_usuario = req.user?.id_usuario;

        if (!id_usuario) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const total = await NotificacionesModel.contarNoLeidas(id_usuario);

        res.json({
            success: true,
            total_no_leidas: total
        });
    } catch (error) {
        console.error('Error contando notificaciones no leídas:', error);
        res.status(500).json({
            error: 'Error contando notificaciones',
            details: error.message
        });
    }
};
