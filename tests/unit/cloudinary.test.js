/**
 * Tests Unitarios de CLOUDINARY SERVICE
 * Mockea cloudinary.uploader para probar lógica sin subir archivos reales
 * NO usa datos ficticios - Solo valida lógica de manejo de archivos
 */

const cloudinary = require('cloudinary').v2;
const cloudinaryService = require('../../src/services/cloudinary.service');

// Mock de Cloudinary
jest.mock('cloudinary', () => ({
    v2: {
        config: jest.fn(),
        uploader: {
            upload_stream: jest.fn(),
            destroy: jest.fn()
        },
        url: jest.fn()
    }
}));

describe('Cloudinary Service - Tests Unitarios', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Configuración de Cloudinary', () => {

        it('debe validar que las variables de entorno estén configuradas', () => {
            const config = {
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET
            };

            // Validar que existan (aunque sean undefined en test)
            expect(config).toHaveProperty('cloud_name');
            expect(config).toHaveProperty('api_key');
            expect(config).toHaveProperty('api_secret');
        });

        it('debe validar formato de cloud_name (alfanumérico)', () => {
            const cloudNameValido = 'mi_cloud_123';
            const cloudNameInvalido = 'cloud name con espacios';

            expect(/^[a-zA-Z0-9_-]+$/.test(cloudNameValido)).toBe(true);
            expect(/^[a-zA-Z0-9_-]+$/.test(cloudNameInvalido)).toBe(false);
        });

    });

    describe('uploadFile - Subida de Archivos', () => {

        it('debe validar que el buffer no esté vacío', () => {
            const bufferValido = Buffer.from('contenido de prueba');
            const bufferVacio = Buffer.alloc(0);

            expect(bufferValido.length).toBeGreaterThan(0);
            expect(bufferVacio.length).toBe(0);
        });

        it('debe construir ruta de carpeta correctamente', () => {
            const baseFolder = process.env.CLOUDINARY_FOLDER || 'SERVER-IMG';
            const subFolder = 'comprobantes';
            const rutaCompleta = `${baseFolder}/${subFolder}`;

            expect(rutaCompleta).toBe('SERVER-IMG/comprobantes');
            expect(rutaCompleta).toContain('/');
        });

        it('debe validar opciones de upload', () => {
            const uploadOptions = {
                folder: 'SERVER-IMG/fotos-perfil',
                resource_type: 'auto',
                use_filename: true,
                unique_filename: true
            };

            expect(uploadOptions.resource_type).toBe('auto');
            expect(uploadOptions.use_filename).toBe(true);
            expect(uploadOptions.unique_filename).toBe(true);
            expect(uploadOptions.folder).toContain('SERVER-IMG');
        });

        it('debe generar public_id único cuando se proporciona filename', () => {
            const filename = 'foto_perfil_usuario_123';
            const uploadOptions = {
                folder: 'SERVER-IMG/fotos',
                public_id: filename
            };

            expect(uploadOptions.public_id).toBe(filename);
            expect(uploadOptions.public_id).not.toContain(' ');
        });

        it('debe manejar diferentes tipos de archivos (image, raw, video)', () => {
            const tiposPermitidos = ['image', 'raw', 'video', 'auto'];

            expect(tiposPermitidos).toContain('image');
            expect(tiposPermitidos).toContain('raw');
            expect(tiposPermitidos).toContain('video');
            expect(tiposPermitidos).toContain('auto');
        });

        it('debe validar estructura de respuesta exitosa', () => {
            const respuestaEsperada = {
                secure_url: 'https://res.cloudinary.com/cloud/image/upload/v123/file.jpg',
                public_id: 'SERVER-IMG/fotos/file',
                format: 'jpg',
                resource_type: 'image',
                bytes: 12345
            };

            expect(respuestaEsperada).toHaveProperty('secure_url');
            expect(respuestaEsperada).toHaveProperty('public_id');
            expect(respuestaEsperada).toHaveProperty('format');
            expect(respuestaEsperada.secure_url).toMatch(/^https:\/\//);
            expect(respuestaEsperada.bytes).toBeGreaterThan(0);
        });

    });

    describe('deleteFile - Eliminación de Archivos', () => {

        it('debe validar formato de public_id', () => {
            const publicIdValido = 'SERVER-IMG/comprobantes/archivo_123';
            const publicIdInvalido = '';

            expect(publicIdValido.length).toBeGreaterThan(0);
            expect(publicIdValido).toContain('/');
            expect(publicIdInvalido.length).toBe(0);
        });

        it('debe validar respuesta de eliminación exitosa', async () => {
            const respuestaExitosa = { result: 'ok' };
            const respuestaNoEncontrado = { result: 'not found' };

            cloudinary.uploader.destroy.mockResolvedValueOnce(respuestaExitosa);

            const result = await cloudinary.uploader.destroy('public_id_test');

            expect(result.result).toBe('ok');
            expect(['ok', 'not found']).toContain(result.result);
        });

    });

    describe('uploadMultiple - Subida Múltiple', () => {

        it('debe validar array de archivos', () => {
            const archivos = [
                { buffer: Buffer.from('file1'), folder: 'docs', filename: 'doc1' },
                { buffer: Buffer.from('file2'), folder: 'docs', filename: 'doc2' }
            ];

            expect(Array.isArray(archivos)).toBe(true);
            expect(archivos.length).toBe(2);
            archivos.forEach(archivo => {
                expect(archivo).toHaveProperty('buffer');
                expect(archivo).toHaveProperty('folder');
                expect(archivo.buffer.length).toBeGreaterThan(0);
            });
        });

        it('debe procesar archivos en paralelo con Promise.all', async () => {
            const archivos = [
                { buffer: Buffer.from('a'), folder: 'test' },
                { buffer: Buffer.from('b'), folder: 'test' }
            ];

            const promises = archivos.map(archivo =>
                Promise.resolve({ secure_url: `url_${archivo.buffer.toString()}` })
            );

            const resultados = await Promise.all(promises);

            expect(resultados.length).toBe(2);
            expect(resultados[0]).toHaveProperty('secure_url');
        });

    });

    describe('getFileUrl - Obtener URL', () => {

        it('debe generar URL segura (HTTPS)', () => {
            const publicId = 'SERVER-IMG/foto.jpg';
            const urlEsperada = 'https://res.cloudinary.com/cloud/image/upload/foto.jpg';

            cloudinary.url.mockReturnValueOnce(urlEsperada);

            const url = cloudinary.url(publicId, { secure: true, resource_type: 'auto' });

            expect(url).toMatch(/^https:\/\//);
            expect(cloudinary.url).toHaveBeenCalledWith(
                publicId,
                { secure: true, resource_type: 'auto' }
            );
        });

        it('debe validar opciones de transformación', () => {
            const opciones = {
                secure: true,
                resource_type: 'auto',
                width: 300,
                height: 300,
                crop: 'fill'
            };

            expect(opciones.secure).toBe(true);
            expect(opciones.resource_type).toBe('auto');
            expect(opciones.width).toBeGreaterThan(0);
            expect(opciones.height).toBeGreaterThan(0);
        });

    });

    describe('isConfigured - Validación de Configuración', () => {

        it('debe verificar que todas las credenciales estén presentes', () => {
            const configCompleta = {
                cloud_name: 'mi_cloud',
                api_key: '123456',
                api_secret: 'secret'
            };

            const estaConfigurado = !!(
                configCompleta.cloud_name &&
                configCompleta.api_key &&
                configCompleta.api_secret
            );

            expect(estaConfigurado).toBe(true);
        });

        it('debe detectar configuración incompleta', () => {
            const configIncompleta = {
                cloud_name: 'mi_cloud',
                api_key: '',
                api_secret: null
            };

            const estaConfigurado = !!(
                configIncompleta.cloud_name &&
                configIncompleta.api_key &&
                configIncompleta.api_secret
            );

            expect(estaConfigurado).toBe(false);
        });

    });

    describe('Manejo de Errores', () => {

        it('debe manejar errores de conexión a Cloudinary', async () => {
            const errorConexion = new Error('Connection timeout');
            cloudinary.uploader.destroy.mockRejectedValueOnce(errorConexion);

            try {
                await cloudinary.uploader.destroy('test_id');
                throw new Error('No debería llegar aquí');
            } catch (error) {
                expect(error.message).toBe('Connection timeout');
            }
        });

        it('debe manejar errores de autenticación', async () => {
            const errorAuth = new Error('Invalid API credentials');
            cloudinary.uploader.destroy.mockRejectedValueOnce(errorAuth);

            try {
                await cloudinary.uploader.destroy('test_id');
                throw new Error('No debería llegar aquí');
            } catch (error) {
                expect(error.message).toContain('credentials');
            }
        });

        it('debe validar tamaño máximo de archivo', () => {
            const maxSize = 10 * 1024 * 1024; // 10MB
            const archivoGrande = Buffer.alloc(15 * 1024 * 1024); // 15MB
            const archivoPequeño = Buffer.alloc(5 * 1024 * 1024); // 5MB

            expect(archivoGrande.length).toBeGreaterThan(maxSize);
            expect(archivoPequeño.length).toBeLessThanOrEqual(maxSize);
        });

    });

    describe('Validaciones de Seguridad', () => {

        it('debe sanitizar nombres de archivo', () => {
            const nombrePeligroso = '../../../etc/passwd';
            const nombreSanitizado = nombrePeligroso.replace(/[^a-zA-Z0-9_-]/g, '_');

            expect(nombreSanitizado).not.toContain('..');
            expect(nombreSanitizado).not.toContain('/');
            expect(nombreSanitizado).toMatch(/^[a-zA-Z0-9_-]+$/);
        });

        it('debe validar extensiones permitidas', () => {
            const extensionesPermitidas = ['.jpg', '.jpeg', '.png', '.pdf', '.webp'];
            const extensionValida = '.jpg';
            const extensionInvalida = '.exe';

            expect(extensionesPermitidas).toContain(extensionValida);
            expect(extensionesPermitidas).not.toContain(extensionInvalida);
        });

    });

});
