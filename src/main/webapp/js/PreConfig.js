/**
 * Copyright (c) 2006-2024, JGraph Holdings Ltd
 * Copyright (c) 2006-2024, draw.io AG
 */
// Overrides of global vars need to be pre-loaded
window.DRAWIO_PUBLIC_BUILD = true;
// TEMPORARY (CHG-001): server-side export has been removed from the sources, but
// the committed js/*.min.js bundles predate that change and still default
// EXPORT_URL to an external service when it is undefined. Keep this until the
// bundles are rebuilt (cd etc/build && ant), then delete it. See docs/CHANGES.md.
window.EXPORT_URL = null;
window.DRAWIO_BASE_URL = null; // Replace with path to base of deployment, e.g. https://www.example.com/folder
window.DRAWIO_VIEWER_URL = null; // Replace your path to the viewer js, e.g. https://www.example.com/js/viewer.min.js
window.DRAWIO_LIGHTBOX_URL = null; // Replace with your lightbox URL, eg. https://www.example.com
window.DRAW_MATH_URL = 'math4/es5';
window.DRAWIO_CONFIG = null; // Replace with your custom draw.io configurations. For more details, https://www.drawio.com/doc/faq/configure-diagram-editor
urlParams['sync'] = 'manual';
