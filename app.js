// Site Inspector - Professional Field Documentation App
// Version 1.0

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    immich: {
        url: 'https://immich.wilkerson-labs.com',
        apiKey: 'h8t6TNFpxrIgsQj5r8DWbSDgWEPkVFDJ7gCBbOC7KyA'
    },
    cloudinary: {
        cloudName: 'dybes2vsp',
        apiKey: '883195784837585',
        apiSecret: 'fTPVqcw-WJUbJFHtNLLuhjzHMUY',
        uploadPreset: 'site-inspector' // We'll create this
    }
};

// ============================================
// STATE MANAGEMENT
// ============================================

let inspections = [];
let currentInspection = null;
let currentPhotoId = null;

// Annotation system
let annotationCanvas = null;
let annotationCtx = null;
let currentTool = 'draw';
let currentColor = '#ef4444';
let currentWidth = 4;
let isDrawing = false;
let startX = 0;
let startY = 0;
let annotationHistory = [];
let annotationHistoryIndex = -1;
let originalImageData = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadInspections();
    renderInspections();
    setupEventListeners();
    checkStorageStatus();
});

// ============================================
// STORAGE - LOCAL
// ============================================

function loadInspections() {
    const stored = localStorage.getItem('siteInspections');
    inspections = stored ? JSON.parse(stored) : [];
}

function saveInspections() {
    localStorage.setItem('siteInspections', JSON.stringify(inspections));
}

// ============================================
// STORAGE - IMMICH (PRIMARY)
// ============================================

async function uploadToImmich(photoBlob, caption) {
    try {
        const formData = new FormData();
        formData.append('assetData', photoBlob, `photo-${Date.now()}.jpg`);
        formData.append('deviceAssetId', `site-inspector-${Date.now()}`);
        formData.append('deviceId', 'site-inspector-pwa');
        formData.append('fileCreatedAt', new Date().toISOString());
        formData.append('fileModifiedAt', new Date().toISOString());

        const response = await fetch(`${CONFIG.immich.url}/api/asset/upload`, {
            method: 'POST',
            headers: {
                'x-api-key': CONFIG.immich.apiKey
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Immich upload failed: ${response.status}`);
        }

        const result = await response.json();
        
        return {
            storage: 'immich',
            assetId: result.id,
            url: `${CONFIG.immich.url}/api/asset/thumbnail/${result.id}?x-api-key=${CONFIG.immich.apiKey}`,
            fullUrl: `${CONFIG.immich.url}/api/asset/file/${result.id}?x-api-key=${CONFIG.immich.apiKey}`,
            caption: caption || '',
            timestamp: new Date().toISOString(),
            needsSync: false
        };

    } catch (error) {
        console.error('Immich upload failed:', error);
        throw error;
    }
}

// ============================================
// STORAGE - CLOUDINARY (BACKUP)
// ============================================

async function uploadToCloudinary(photoBlob, caption) {
    try {
        const formData = new FormData();
        formData.append('file', photoBlob);
        formData.append('upload_preset', 'ml_default'); // Using default preset
        formData.append('folder', 'site-inspector');

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CONFIG.cloudinary.cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );

        if (!response.ok) {
            throw new Error(`Cloudinary upload failed: ${response.status}`);
        }

        const result = await response.json();

        return {
            storage: 'cloudinary',
            cloudinaryId: result.public_id,
            url: result.secure_url,
            thumbnail: result.secure_url.replace('/upload/', '/upload/w_400,h_400,c_fill/'),
            caption: caption || '',
            timestamp: new Date().toISOString(),
            needsSync: true  // Will sync to Immich later
        };

    } catch (error) {
        console.error('Cloudinary upload failed:', error);
        throw error;
    }
}

// ============================================
// STORAGE - HYBRID LOGIC
// ============================================

async function uploadPhoto(photoBlob, caption) {
    showLoading('Uploading to Immich...');

    try {
        // TRY IMMICH FIRST (PRIMARY)
        const result = await uploadToImmich(photoBlob, caption);
        hideLoading();
        showNotification('✅ Uploaded to Immich', 'success');
        return result;

    } catch (immichError) {
        console.log('Immich unavailable, trying Cloudinary backup...');
        
        try {
            // FALLBACK TO CLOUDINARY
            updateLoadingText('Immich offline, using Cloudinary backup...');
            const result = await uploadToCloudinary(photoBlob, caption);
            hideLoading();
            showNotification('✅ Uploaded to Cloudinary (will sync to Immich later)', 'warning');
            return result;

        } catch (cloudinaryError) {
            // BOTH FAILED - Store locally
            hideLoading();
            showNotification('⚠️ Both storage systems offline. Photo saved locally.', 'error');
            
            return {
                storage: 'local',
                localBlob: await blobToBase64(photoBlob),
                caption: caption || '',
                timestamp: new Date().toISOString(),
                needsSync: true
            };
        }
    }
}

// ============================================
// PHOTO MANAGEMENT
// ============================================

async function handlePhotoCapture(file) {
    if (!currentInspection) return;

    const photoId = `photo_${Date.now()}`;
    
    try {
        const result = await uploadPhoto(file, '');
        
        const photo = {
            id: photoId,
            ...result
        };

        currentInspection.photos.push(photo);
        saveInspections();
        renderPhotos();

    } catch (error) {
        console.error('Photo capture error:', error);
        showNotification('❌ Failed to save photo', 'error');
    }
}

function renderPhotos() {
    if (!currentInspection) return;

    const grid = document.getElementById('photoGrid');
    const count = document.getElementById('photoCount');
    
    count.textContent = currentInspection.photos.length;

    if (currentInspection.photos.length === 0) {
        grid.innerHTML = '<p class="empty-state">No photos yet. Add your first photo!</p>';
        return;
    }

    grid.innerHTML = currentInspection.photos.map(photo => {
        const thumbnailUrl = photo.storage === 'local' 
            ? photo.localBlob 
            : (photo.thumbnail || photo.url);

        const storageIcon = {
            'immich': '🏠',
            'cloudinary': '☁️',
            'local': '📱'
        }[photo.storage];

        return `
            <div class="photo-card" onclick="viewPhoto('${photo.id}')">
                <img src="${thumbnailUrl}" alt="Photo" loading="lazy">
                <div class="photo-overlay">
                    <span class="storage-badge">${storageIcon}</span>
                    ${photo.needsSync ? '<span class="sync-badge">⏳</span>' : ''}
                </div>
                ${photo.caption ? `<div class="photo-caption">${photo.caption}</div>` : ''}
            </div>
        `;
    }).join('');
}

function viewPhoto(photoId) {
    currentPhotoId = photoId;
    const photo = currentInspection.photos.find(p => p.id === photoId);
    if (!photo) return;

    const modal = document.getElementById('photoViewerModal');
    const img = document.getElementById('viewerImage');
    const captionInput = document.getElementById('photoCaptionInput');

    const fullUrl = photo.storage === 'local' 
        ? photo.localBlob 
        : (photo.fullUrl || photo.url);

    img.src = fullUrl;
    captionInput.value = photo.caption || '';
    
    modal.classList.remove('hidden');
}

function closePhotoViewer() {
    document.getElementById('photoViewerModal').classList.add('hidden');
    currentPhotoId = null;
}

function saveCaption() {
    if (!currentPhotoId || !currentInspection) return;

    const photo = currentInspection.photos.find(p => p.id === currentPhotoId);
    if (!photo) return;

    const caption = document.getElementById('photoCaptionInput').value.trim();
    photo.caption = caption;
    
    saveInspections();
    renderPhotos();
    showNotification('✅ Caption saved', 'success');
}

function deleteCurrentPhoto() {
    if (!currentPhotoId || !currentInspection) return;

    if (!confirm('Delete this photo?')) return;

    currentInspection.photos = currentInspection.photos.filter(p => p.id !== currentPhotoId);
    saveInspections();
    renderPhotos();
    closePhotoViewer();
    showNotification('🗑️ Photo deleted', 'success');
}

// ============================================
// PHOTO ANNOTATION SYSTEM
// ============================================

function openAnnotationEditor() {
    if (!currentPhotoId || !currentInspection) return;

    const photo = currentInspection.photos.find(p => p.id === currentPhotoId);
    if (!photo) return;

    // Close photo viewer
    closePhotoViewer();

    // Open annotation editor
    const modal = document.getElementById('annotationModal');
    modal.classList.remove('hidden');

    // Initialize canvas
    setTimeout(() => {
        initializeAnnotationCanvas(photo);
    }, 100);
}

function initializeAnnotationCanvas(photo) {
    annotationCanvas = document.getElementById('annotationCanvas');
    annotationCtx = annotationCanvas.getContext('2d');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    const imageUrl = photo.storage === 'local' 
        ? photo.localBlob 
        : (photo.fullUrl || photo.url);

    img.onload = () => {
        // Set canvas size to match image
        const maxWidth = window.innerWidth > 600 ? 600 : window.innerWidth - 40;
        const scale = maxWidth / img.width;
        annotationCanvas.width = img.width;
        annotationCanvas.height = img.height;
        annotationCanvas.style.width = (img.width * scale) + 'px';
        annotationCanvas.style.height = (img.height * scale) + 'px';

        // Draw image
        annotationCtx.drawImage(img, 0, 0);

        // Save original state
        originalImageData = annotationCtx.getImageData(0, 0, annotationCanvas.width, annotationCanvas.height);
        
        // Initialize history
        annotationHistory = [originalImageData];
        annotationHistoryIndex = 0;

        // Setup event listeners
        setupAnnotationEvents();
    };

    img.onerror = () => {
        showNotification('❌ Failed to load image for annotation', 'error');
        closeAnnotationEditor();
    };

    img.src = imageUrl;
}

function setupAnnotationEvents() {
    // Tool selection
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTool = btn.dataset.tool;
        });
    });

    // Color selection
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentColor = btn.dataset.color;
        });
    });

    // Width selection
    document.querySelectorAll('.width-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.width-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentWidth = parseInt(btn.dataset.width);
        });
    });

    // Action buttons
    document.getElementById('undoBtn').addEventListener('click', undoAnnotation);
    document.getElementById('redoBtn').addEventListener('click', redoAnnotation);
    document.getElementById('clearBtn').addEventListener('click', clearAnnotations);
    document.getElementById('saveAnnotationBtn').addEventListener('click', saveAnnotatedPhoto);
    document.getElementById('cancelAnnotationBtn').addEventListener('click', closeAnnotationEditor);

    // Canvas drawing events
    annotationCanvas.addEventListener('mousedown', startAnnotation);
    annotationCanvas.addEventListener('mousemove', drawAnnotation);
    annotationCanvas.addEventListener('mouseup', endAnnotation);
    annotationCanvas.addEventListener('mouseout', endAnnotation);

    // Touch events for mobile
    annotationCanvas.addEventListener('touchstart', handleTouchStart);
    annotationCanvas.addEventListener('touchmove', handleTouchMove);
    annotationCanvas.addEventListener('touchend', handleTouchEnd);
}

function getCanvasCoordinates(e) {
    const rect = annotationCanvas.getBoundingClientRect();
    const scaleX = annotationCanvas.width / rect.width;
    const scaleY = annotationCanvas.height / rect.height;

    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function startAnnotation(e) {
    isDrawing = true;
    const coords = getCanvasCoordinates(e);
    startX = coords.x;
    startY = coords.y;

    if (currentTool === 'text') {
        addTextAnnotation(startX, startY);
        isDrawing = false;
        return;
    }

    if (currentTool === 'draw') {
        annotationCtx.beginPath();
        annotationCtx.moveTo(startX, startY);
    }
}

function drawAnnotation(e) {
    if (!isDrawing) return;

    const coords = getCanvasCoordinates(e);
    annotationCtx.strokeStyle = currentColor;
    annotationCtx.fillStyle = currentColor;
    annotationCtx.lineWidth = currentWidth;
    annotationCtx.lineCap = 'round';
    annotationCtx.lineJoin = 'round';

    if (currentTool === 'draw') {
        annotationCtx.lineTo(coords.x, coords.y);
        annotationCtx.stroke();
    } else {
        // For shapes, clear and redraw from original
        const lastHistory = annotationHistory[annotationHistoryIndex];
        annotationCtx.putImageData(lastHistory, 0, 0);

        if (currentTool === 'arrow') {
            drawArrow(startX, startY, coords.x, coords.y);
        } else if (currentTool === 'circle') {
            drawCircle(startX, startY, coords.x, coords.y);
        } else if (currentTool === 'rectangle') {
            drawRectangle(startX, startY, coords.x, coords.y);
        }
    }
}

function endAnnotation(e) {
    if (!isDrawing) return;
    isDrawing = false;

    // Save to history
    const imageData = annotationCtx.getImageData(0, 0, annotationCanvas.width, annotationCanvas.height);
    annotationHistory = annotationHistory.slice(0, annotationHistoryIndex + 1);
    annotationHistory.push(imageData);
    annotationHistoryIndex++;
}

// Touch event handlers
function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    annotationCanvas.dispatchEvent(mouseEvent);
}

function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    annotationCanvas.dispatchEvent(mouseEvent);
}

function handleTouchEnd(e) {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    annotationCanvas.dispatchEvent(mouseEvent);
}

// Drawing functions
function drawArrow(fromX, fromY, toX, toY) {
    const headLength = 20;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    // Draw line
    annotationCtx.beginPath();
    annotationCtx.moveTo(fromX, fromY);
    annotationCtx.lineTo(toX, toY);
    annotationCtx.stroke();

    // Draw arrowhead
    annotationCtx.beginPath();
    annotationCtx.moveTo(toX, toY);
    annotationCtx.lineTo(
        toX - headLength * Math.cos(angle - Math.PI / 6),
        toY - headLength * Math.sin(angle - Math.PI / 6)
    );
    annotationCtx.lineTo(
        toX - headLength * Math.cos(angle + Math.PI / 6),
        toY - headLength * Math.sin(angle + Math.PI / 6)
    );
    annotationCtx.closePath();
    annotationCtx.fill();
}

function drawCircle(startX, startY, endX, endY) {
    const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    annotationCtx.beginPath();
    annotationCtx.arc(startX, startY, radius, 0, 2 * Math.PI);
    annotationCtx.stroke();
}

function drawRectangle(startX, startY, endX, endY) {
    const width = endX - startX;
    const height = endY - startY;
    annotationCtx.strokeRect(startX, startY, width, height);
}

function addTextAnnotation(x, y) {
    const text = prompt('Enter text:');
    if (!text) return;

    annotationCtx.font = '24px Arial';
    annotationCtx.fillStyle = currentColor;
    annotationCtx.fillText(text, x, y);

    // Save to history
    const imageData = annotationCtx.getImageData(0, 0, annotationCanvas.width, annotationCanvas.height);
    annotationHistory = annotationHistory.slice(0, annotationHistoryIndex + 1);
    annotationHistory.push(imageData);
    annotationHistoryIndex++;
}

function undoAnnotation() {
    if (annotationHistoryIndex > 0) {
        annotationHistoryIndex--;
        const imageData = annotationHistory[annotationHistoryIndex];
        annotationCtx.putImageData(imageData, 0, 0);
    }
}

function redoAnnotation() {
    if (annotationHistoryIndex < annotationHistory.length - 1) {
        annotationHistoryIndex++;
        const imageData = annotationHistory[annotationHistoryIndex];
        annotationCtx.putImageData(imageData, 0, 0);
    }
}

function clearAnnotations() {
    if (!confirm('Clear all annotations?')) return;

    annotationCtx.putImageData(originalImageData, 0, 0);
    annotationHistory = [originalImageData];
    annotationHistoryIndex = 0;
}

async function saveAnnotatedPhoto() {
    if (!currentPhotoId || !currentInspection) return;

    showLoading('Saving annotated photo...');

    try {
        // Convert canvas to blob
        const blob = await new Promise(resolve => {
            annotationCanvas.toBlob(resolve, 'image/jpeg', 0.9);
        });

        // Upload annotated photo
        const result = await uploadPhoto(blob, 'Annotated');

        // Find and update the photo
        const photoIndex = currentInspection.photos.findIndex(p => p.id === currentPhotoId);
        if (photoIndex !== -1) {
            // Keep the caption from original photo
            result.caption = currentInspection.photos[photoIndex].caption + ' (Annotated)';
            
            // Replace the photo with annotated version
            currentInspection.photos[photoIndex] = {
                ...result,
                id: currentPhotoId
            };
        }

        saveInspections();
        hideLoading();
        closeAnnotationEditor();
        renderPhotos();
        showNotification('✅ Annotated photo saved!', 'success');

    } catch (error) {
        console.error('Failed to save annotated photo:', error);
        hideLoading();
        showNotification('❌ Failed to save annotated photo', 'error');
    }
}

function closeAnnotationEditor() {
    document.getElementById('annotationModal').classList.add('hidden');
    annotationCanvas = null;
    annotationCtx = null;
    annotationHistory = [];
    annotationHistoryIndex = -1;
    originalImageData = null;
}

// ============================================
// INSPECTION MANAGEMENT
// ============================================

function renderInspections() {
    const list = document.getElementById('inspectionsList');
    
    if (inspections.length === 0) {
        list.innerHTML = '<p class="empty-state">No inspections yet. Create your first one!</p>';
        return;
    }

    const sorted = [...inspections].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
    );

    list.innerHTML = sorted.map(inspection => `
        <div class="inspection-card" onclick="viewInspection('${inspection.id}')">
            <div class="inspection-header">
                <h3>${inspection.location}</h3>
                <span class="photo-count">📷 ${inspection.photos.length}</span>
            </div>
            ${inspection.workOrder ? `<div class="work-order-badge">WO #${inspection.workOrder}</div>` : ''}
            <div class="inspection-date">${formatDate(inspection.date)}</div>
        </div>
    `).join('');
}

function showNewInspectionScreen() {
    document.getElementById('inspectionsScreen').classList.add('hidden');
    document.getElementById('newInspectionScreen').classList.remove('hidden');
}

function createInspection() {
    const location = document.getElementById('locationInput').value.trim();
    const workOrder = document.getElementById('workOrderInput').value.trim();
    const notes = document.getElementById('inspectionNotes').value.trim();

    if (!location) {
        showNotification('⚠️ Location name required', 'error');
        return;
    }

    const inspection = {
        id: `inspection_${Date.now()}`,
        location: location,
        workOrder: workOrder,
        notes: notes,
        date: new Date().toISOString(),
        photos: []
    };

    inspections.push(inspection);
    saveInspections();
    
    // Clear form
    document.getElementById('locationInput').value = '';
    document.getElementById('workOrderInput').value = '';
    document.getElementById('inspectionNotes').value = '';

    // View the new inspection
    viewInspection(inspection.id);
}

function viewInspection(inspectionId) {
    currentInspection = inspections.find(i => i.id === inspectionId);
    if (!currentInspection) return;

    document.getElementById('inspectionsScreen').classList.add('hidden');
    document.getElementById('newInspectionScreen').classList.add('hidden');
    document.getElementById('inspectionDetailScreen').classList.remove('hidden');

    // Update header
    document.getElementById('detailLocation').textContent = currentInspection.location;
    document.getElementById('detailDate').textContent = formatDate(currentInspection.date);
    
    const workOrderBadge = document.getElementById('detailWorkOrder');
    if (currentInspection.workOrder) {
        workOrderBadge.textContent = `WO #${currentInspection.workOrder}`;
        workOrderBadge.style.display = 'inline-block';
    } else {
        workOrderBadge.style.display = 'none';
    }

    renderPhotos();
}

function deleteInspection() {
    if (!currentInspection) return;

    if (!confirm(`Delete inspection for ${currentInspection.location}? This cannot be undone.`)) return;

    inspections = inspections.filter(i => i.id !== currentInspection.id);
    saveInspections();
    currentInspection = null;
    backToMain();
    showNotification('🗑️ Inspection deleted', 'success');
}

function backToMain() {
    document.getElementById('inspectionsScreen').classList.remove('hidden');
    document.getElementById('newInspectionScreen').classList.add('hidden');
    document.getElementById('inspectionDetailScreen').classList.add('hidden');
    currentInspection = null;
    renderInspections();
}

// ============================================
// SYNC MANAGEMENT
// ============================================

async function syncToImmich() {
    const photosToSync = [];
    
    inspections.forEach(inspection => {
        inspection.photos.forEach(photo => {
            if (photo.needsSync && (photo.storage === 'cloudinary' || photo.storage === 'local')) {
                photosToSync.push({ inspection, photo });
            }
        });
    });

    if (photosToSync.length === 0) {
        showNotification('✅ All photos synced!', 'success');
        return;
    }

    showLoading(`Syncing ${photosToSync.length} photos to Immich...`);

    let synced = 0;
    for (const { inspection, photo } of photosToSync) {
        try {
            // Download from Cloudinary or get local blob
            let blob;
            if (photo.storage === 'cloudinary') {
                const response = await fetch(photo.url);
                blob = await response.blob();
            } else {
                blob = await base64ToBlob(photo.localBlob);
            }

            // Upload to Immich
            const result = await uploadToImmich(blob, photo.caption);
            
            // Update photo record
            Object.assign(photo, result);
            photo.needsSync = false;
            
            synced++;
            updateLoadingText(`Synced ${synced}/${photosToSync.length} photos...`);
            
        } catch (error) {
            console.error('Sync failed for photo:', error);
        }
    }

    saveInspections();
    renderPhotos();
    hideLoading();
    
    if (synced === photosToSync.length) {
        showNotification(`✅ Synced ${synced} photos to Immich!`, 'success');
    } else {
        showNotification(`⚠️ Synced ${synced}/${photosToSync.length} photos`, 'warning');
    }
}

// ============================================
// STORAGE STATUS
// ============================================

async function checkStorageStatus() {
    // Check Immich
    try {
        const response = await fetch(`${CONFIG.immich.url}/api/server-info/ping`, {
            headers: { 'x-api-key': CONFIG.immich.apiKey }
        });
        
        const immichStatus = document.getElementById('immichStatus');
        const immichText = document.getElementById('immichStatusText');
        
        if (response.ok) {
            immichStatus.className = 'status-dot status-online';
            immichText.textContent = 'Connected';
        } else {
            immichStatus.className = 'status-dot status-offline';
            immichText.textContent = 'Offline';
        }
    } catch (error) {
        const immichStatus = document.getElementById('immichStatus');
        const immichText = document.getElementById('immichStatusText');
        immichStatus.className = 'status-dot status-offline';
        immichText.textContent = 'Offline';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // New inspection
    document.getElementById('newInspectionBtn').addEventListener('click', showNewInspectionScreen);
    document.getElementById('createInspectionBtn').addEventListener('click', createInspection);

    // Photo capture
    document.getElementById('takePhotoBtn').addEventListener('click', () => {
        document.getElementById('photoFileInput').click();
    });

    document.getElementById('uploadPhotoBtn').addEventListener('click', () => {
        document.getElementById('uploadFileInput').click();
    });

    document.getElementById('photoFileInput').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            handlePhotoCapture(e.target.files[0]);
            e.target.value = '';
        }
    });

    document.getElementById('uploadFileInput').addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            for (const file of e.target.files) {
                await handlePhotoCapture(file);
            }
            e.target.value = '';
        }
    });

    // Photo viewer
    document.getElementById('saveCaptionBtn').addEventListener('click', saveCaption);
    document.getElementById('annotatePhotoBtn').addEventListener('click', openAnnotationEditor);
    document.getElementById('deletePhotoBtn').addEventListener('click', deleteCurrentPhoto);

    // Inspection actions
    document.getElementById('deleteInspectionBtn').addEventListener('click', deleteInspection);
    document.getElementById('generateReportBtn').addEventListener('click', generateReport);

    // Report generation
    document.getElementById('generatePdfBtn').addEventListener('click', generatePDF);
    document.getElementById('emailReportBtn').addEventListener('click', emailReport);

    // Settings
    document.getElementById('settingsBtn').addEventListener('click', showSettings);
    document.getElementById('manualSyncBtn').addEventListener('click', syncToImmich);
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataBtn').addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput').addEventListener('change', importData);

    // Search
    document.getElementById('searchBox').addEventListener('input', (e) => {
        filterInspections(e.target.value);
    });
}

// ============================================
// SETTINGS
// ============================================

function showSettings() {
    document.getElementById('settingsModal').classList.remove('hidden');
    checkStorageStatus();
}

function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
}

// ============================================
// DATA EXPORT/IMPORT
// ============================================

function exportData() {
    const dataStr = JSON.stringify(inspections, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `site-inspector-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('💾 Data exported', 'success');
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            if (confirm(`Import ${imported.length} inspections? This will merge with existing data.`)) {
                inspections = [...inspections, ...imported];
                saveInspections();
                renderInspections();
                showNotification('✅ Data imported', 'success');
            }
        } catch (error) {
            showNotification('❌ Invalid file format', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ============================================
// REPORT GENERATION
// ============================================

function generateReport() {
    if (!currentInspection) return;
    
    // Open report modal
    document.getElementById('reportModal').classList.remove('hidden');
    
    // Load saved inspector name
    const savedName = localStorage.getItem('inspectorName') || '';
    document.getElementById('inspectorName').value = savedName;
    
    // Generate preview
    generateReportPreview();
}

function generateReportPreview() {
    if (!currentInspection) return;
    
    const preview = document.getElementById('reportPreview');
    
    const html = `
        <div class="preview-header">
            <h3>Site Inspection Report</h3>
            <p><strong>Location:</strong> ${currentInspection.location}</p>
            ${currentInspection.workOrder ? `<p><strong>Work Order:</strong> #${currentInspection.workOrder}</p>` : ''}
            <p><strong>Date:</strong> ${formatDate(currentInspection.date)}</p>
            <p><strong>Photos:</strong> ${currentInspection.photos.length}</p>
        </div>
        ${currentInspection.notes ? `
            <div class="preview-section">
                <h4>Notes:</h4>
                <p>${currentInspection.notes}</p>
            </div>
        ` : ''}
        <div class="preview-section">
            <h4>Photos:</h4>
            <div class="preview-photos">
                ${currentInspection.photos.map((photo, index) => `
                    <div class="preview-photo-item">
                        <div class="preview-photo-number">${index + 1}</div>
                        ${photo.caption ? `<p>${photo.caption}</p>` : '<p>No caption</p>'}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    preview.innerHTML = html;
}

async function generatePDF() {
    if (!currentInspection) return;
    
    const inspectorName = document.getElementById('inspectorName').value.trim();
    const reportNotes = document.getElementById('reportNotes').value.trim();
    const includePhotos = document.getElementById('includePhotos').checked;
    
    if (!inspectorName) {
        showNotification('⚠️ Please enter your name', 'error');
        return;
    }
    
    // Save inspector name for future use
    localStorage.setItem('inspectorName', inspectorName);
    
    showLoading('Generating PDF...');
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        let yPos = 20;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);
        
        // Header
        doc.setFontSize(20);
        doc.setFont(undefined, 'bold');
        doc.text('SITE INSPECTION REPORT', pageWidth / 2, yPos, { align: 'center' });
        yPos += 15;
        
        // Divider line
        doc.setDrawColor(59, 130, 246);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 10;
        
        // Inspection Details
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('INSPECTION DETAILS', margin, yPos);
        yPos += 8;
        
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        
        doc.text(`Location: ${currentInspection.location}`, margin, yPos);
        yPos += 6;
        
        if (currentInspection.workOrder) {
            doc.text(`Work Order: #${currentInspection.workOrder}`, margin, yPos);
            yPos += 6;
        }
        
        doc.text(`Date: ${formatDate(currentInspection.date)}`, margin, yPos);
        yPos += 6;
        
        doc.text(`Inspector: ${inspectorName}`, margin, yPos);
        yPos += 6;
        
        doc.text(`Total Photos: ${currentInspection.photos.length}`, margin, yPos);
        yPos += 10;
        
        // Inspection Notes
        if (currentInspection.notes) {
            doc.setFont(undefined, 'bold');
            doc.text('NOTES:', margin, yPos);
            yPos += 6;
            
            doc.setFont(undefined, 'normal');
            const notesLines = doc.splitTextToSize(currentInspection.notes, contentWidth);
            doc.text(notesLines, margin, yPos);
            yPos += (notesLines.length * 6) + 10;
        }
        
        // Additional Report Notes
        if (reportNotes) {
            doc.setFont(undefined, 'bold');
            doc.text('ADDITIONAL OBSERVATIONS:', margin, yPos);
            yPos += 6;
            
            doc.setFont(undefined, 'normal');
            const additionalLines = doc.splitTextToSize(reportNotes, contentWidth);
            doc.text(additionalLines, margin, yPos);
            yPos += (additionalLines.length * 6) + 10;
        }
        
        // Photos Section
        if (includePhotos && currentInspection.photos.length > 0) {
            updateLoadingText(`Adding ${currentInspection.photos.length} photos...`);
            
            for (let i = 0; i < currentInspection.photos.length; i++) {
                const photo = currentInspection.photos[i];
                
                // Check if we need a new page
                if (yPos > pageHeight - 100) {
                    doc.addPage();
                    yPos = 20;
                }
                
                doc.setFont(undefined, 'bold');
                doc.setFontSize(11);
                doc.text(`Photo ${i + 1}`, margin, yPos);
                yPos += 6;
                
                if (photo.caption) {
                    doc.setFont(undefined, 'normal');
                    doc.setFontSize(9);
                    const captionLines = doc.splitTextToSize(photo.caption, contentWidth);
                    doc.text(captionLines, margin, yPos);
                    yPos += (captionLines.length * 5) + 5;
                }
                
                try {
                    // Load and add photo
                    const imgData = await loadPhotoForPDF(photo);
                    if (imgData) {
                        const imgWidth = contentWidth;
                        const imgHeight = (imgWidth * 3) / 4; // 4:3 aspect ratio
                        
                        // Check if image fits on page
                        if (yPos + imgHeight > pageHeight - margin) {
                            doc.addPage();
                            yPos = 20;
                        }
                        
                        doc.addImage(imgData, 'JPEG', margin, yPos, imgWidth, imgHeight);
                        yPos += imgHeight + 10;
                    }
                } catch (error) {
                    console.error('Error adding photo to PDF:', error);
                    doc.setFontSize(9);
                    doc.text('[Photo could not be loaded]', margin, yPos);
                    yPos += 10;
                }
                
                updateLoadingText(`Added photo ${i + 1}/${currentInspection.photos.length}...`);
            }
        }
        
        // Footer on last page
        doc.setFontSize(8);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(128, 128, 128);
        const footer = `Generated by Site Inspector on ${new Date().toLocaleDateString()}`;
        doc.text(footer, pageWidth / 2, pageHeight - 10, { align: 'center' });
        
        // Save PDF
        const filename = `Inspection_${currentInspection.location.replace(/\s+/g, '_')}_${currentInspection.workOrder || 'NoWO'}.pdf`;
        doc.save(filename);
        
        hideLoading();
        closeReportModal();
        showNotification('✅ PDF report generated!', 'success');
        
    } catch (error) {
        console.error('PDF generation error:', error);
        hideLoading();
        showNotification('❌ Failed to generate PDF', 'error');
    }
}

async function loadPhotoForPDF(photo) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const imageUrl = photo.storage === 'local' 
            ? photo.localBlob 
            : (photo.fullUrl || photo.url);
        
        img.onload = () => {
            // Create canvas to convert image
            const canvas = document.createElement('canvas');
            const maxWidth = 800;
            const scale = maxWidth / img.width;
            canvas.width = maxWidth;
            canvas.height = img.height * scale;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        
        img.onerror = () => {
            resolve(null);
        };
        
        img.src = imageUrl;
    });
}

function emailReport() {
    if (!currentInspection) return;
    
    const inspectorName = document.getElementById('inspectorName').value.trim();
    const reportNotes = document.getElementById('reportNotes').value.trim();
    
    if (!inspectorName) {
        showNotification('⚠️ Please enter your name', 'error');
        return;
    }
    
    // Save inspector name
    localStorage.setItem('inspectorName', inspectorName);
    
    // Generate email content
    let emailBody = `SITE INSPECTION REPORT\n\n`;
    emailBody += `═══════════════════════════════════════\n\n`;
    emailBody += `INSPECTION DETAILS\n\n`;
    emailBody += `Location: ${currentInspection.location}\n`;
    
    if (currentInspection.workOrder) {
        emailBody += `Work Order: #${currentInspection.workOrder}\n`;
    }
    
    emailBody += `Date: ${formatDate(currentInspection.date)}\n`;
    emailBody += `Inspector: ${inspectorName}\n`;
    emailBody += `Total Photos: ${currentInspection.photos.length}\n\n`;
    
    if (currentInspection.notes) {
        emailBody += `NOTES:\n${currentInspection.notes}\n\n`;
    }
    
    if (reportNotes) {
        emailBody += `ADDITIONAL OBSERVATIONS:\n${reportNotes}\n\n`;
    }
    
    emailBody += `PHOTOS:\n\n`;
    currentInspection.photos.forEach((photo, index) => {
        emailBody += `${index + 1}. ${photo.caption || 'No caption'}\n`;
        if (photo.storage !== 'local') {
            emailBody += `   View: ${photo.url}\n`;
        }
        emailBody += `\n`;
    });
    
    emailBody += `\n═══════════════════════════════════════\n`;
    emailBody += `Generated by Site Inspector\n`;
    emailBody += `${new Date().toLocaleString()}\n`;
    
    // Create mailto link
    const subject = `Site Inspection Report - ${currentInspection.location}${currentInspection.workOrder ? ' - WO #' + currentInspection.workOrder : ''}`;
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    
    // Open email client
    window.location.href = mailtoLink;
    
    showNotification('📧 Email client opened', 'success');
}

function closeReportModal() {
    document.getElementById('reportModal').classList.add('hidden');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatDate(isoDate) {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showLoading(text) {
    const indicator = document.getElementById('loadingIndicator');
    const loadingText = document.getElementById('loadingText');
    loadingText.textContent = text;
    indicator.classList.remove('hidden');
}

function updateLoadingText(text) {
    document.getElementById('loadingText').textContent = text;
}

function hideLoading() {
    document.getElementById('loadingIndicator').classList.add('hidden');
}

function showNotification(message, type = 'info') {
    // Simple notification - can enhance later
    alert(message);
}

function filterInspections(query) {
    if (!query) {
        renderInspections();
        return;
    }

    const filtered = inspections.filter(i => 
        i.location.toLowerCase().includes(query.toLowerCase()) ||
        (i.workOrder && i.workOrder.toLowerCase().includes(query.toLowerCase()))
    );

    const list = document.getElementById('inspectionsList');
    list.innerHTML = filtered.map(inspection => `
        <div class="inspection-card" onclick="viewInspection('${inspection.id}')">
            <div class="inspection-header">
                <h3>${inspection.location}</h3>
                <span class="photo-count">📷 ${inspection.photos.length}</span>
            </div>
            ${inspection.workOrder ? `<div class="work-order-badge">WO #${inspection.workOrder}</div>` : ''}
            <div class="inspection-date">${formatDate(inspection.date)}</div>
        </div>
    `).join('');
}

async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function base64ToBlob(base64) {
    const response = await fetch(base64);
    return response.blob();
}
