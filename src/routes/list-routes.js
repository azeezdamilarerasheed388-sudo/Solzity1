const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    const routes = [];
    
    // Get all registered routes from app
    const app = req.app;
    const stack = app._router.stack;
    
    stack.forEach(layer => {
        if (layer.route) {
            const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
            routes.push({
                path: layer.route.path,
                methods: methods
            });
        } else if (layer.name === 'router') {
            // Handle nested routers
            const prefix = layer.regexp.source
                .replace('\\/?(?=\\/|$)', '')
                .replace(/\\\//g, '/')
                .replace(/\^/g, '')
                .replace(/\?/g, '');
            
            if (layer.handle.stack) {
                layer.handle.stack.forEach(innerLayer => {
                    if (innerLayer.route) {
                        const methods = Object.keys(innerLayer.route.methods).join(', ').toUpperCase();
                        routes.push({
                            path: prefix + innerLayer.route.path,
                            methods: methods
                        });
                    }
                });
            }
        }
    });
    
    res.json({
        success: true,
        routes: routes.sort((a, b) => a.path.localeCompare(b.path))
    });
});

module.exports = router;
