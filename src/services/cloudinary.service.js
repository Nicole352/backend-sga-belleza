const cloudinary = require('cloudinary').v2;

// Configuración de Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'di090ggjn',
    api_key: process.env.CLOUDINARY_API_KEY || '563842446673729',
    api_secret: process.env.CLOUDINARY_API_SECRET || '4zMAN4uaoJetYTuRvsmnIFDMe08'
});

/**
 * Subir un archivo a Cloudinary
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {string} folder - Carpeta en Cloudinary (ej: 'comprobantes', 'tareas')
 * @param {string} filename - Nombre del archivo (opcional)
 * @returns {Promise<Object>} - Resultado con secure_url y public_id
 */
async function uploadFile(fileBuffer, folder = 'SERVER-IMG', filename = null) {
    try {
        return new Promise((resolve, reject) => {
            const uploadOptions = {
                folder: `${process.env.CLOUDINARY_FOLDER || 'SERVER-IMG'}/${folder}`,
                resource_type: 'auto', // Detecta automáticamente el tipo (image, raw, video)
                use_filename: true,
                unique_filename: true
            };

            if (filename) {
                uploadOptions.public_id = filename;
            }

            // Subir desde buffer usando upload_stream
            const uploadStream = cloudinary.uploader.upload_stream(
                uploadOptions,
                (error, result) => {
                    if (error) {
                        console.error('Error subiendo a Cloudinary:', error);
                        reject(error);
                    } else {
                        console.log('Archivo subido a Cloudinary:', result.secure_url);
                        resolve({
                            secure_url: result.secure_url,
                            public_id: result.public_id,
                            format: result.format,
                            resource_type: result.resource_type,
                            bytes: result.bytes
                        });
                    }
                }
            );

            // Escribir el buffer al stream
            uploadStream.end(fileBuffer);
        });
    } catch (error) {
        console.error('Error en uploadFile:', error);
        throw error;
    }
}

/**
 * Eliminar un archivo de Cloudinary
 * @param {string} publicId - Public ID del archivo en Cloudinary
 * @returns {Promise<Object>} - Resultado de la eliminación
 */
async function deleteFile(publicId) {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        console.log('Archivo eliminado de Cloudinary:', publicId);
        return result;
    } catch (error) {
        console.error('Error eliminando archivo de Cloudinary:', error);
        throw error;
    }
}

/**
 * Subir múltiples archivos a Cloudinary
 * @param {Array} files - Array de objetos {buffer, folder, filename}
 * @returns {Promise<Array>} - Array de resultados
 */
async function uploadMultiple(files) {
    try {
        const uploadPromises = files.map(file =>
            uploadFile(file.buffer, file.folder, file.filename)
        );
        return await Promise.all(uploadPromises);
    } catch (error) {
        console.error('Error subiendo múltiples archivos:', error);
        throw error;
    }
}

/**
 * Obtener URL de un archivo por su public_id
 * @param {string} publicId - Public ID del archivo
 * @returns {string} - URL del archivo
 */
function getFileUrl(publicId) {
    return cloudinary.url(publicId, {
        secure: true,
        resource_type: 'auto'
    });
}

/**
 * Verificar si Cloudinary está configurado correctamente
 * @returns {boolean}
 */
function isConfigured() {
    const config = cloudinary.config();
    return !!(config.cloud_name && config.api_key && config.api_secret);
}

module.exports = {
    uploadFile,
    deleteFile,
    uploadMultiple,
    getFileUrl,
    isConfigured,
    cloudinary
};
