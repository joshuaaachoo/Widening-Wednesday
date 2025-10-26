let currentView = 'slideshow';
let currentSlideIndex = 0;
let isTransitioning = false;
let textures = [];
let shaderMaterial, scene, camera, renderer;
let songs = [];
let currentUser = null;

// ====== API INTEGRATION ======
async function fetchUser() {
    try {
        const res = await fetch('/api/me');
        if (res.ok) {
            currentUser = await res.json();
        } else {
            currentUser = null;
        }
    } catch (error) {
        console.error('Error fetching user:', error);
        currentUser = null;
    }
    renderAuthUI();
}

function renderAuthUI() {
    const el = document.getElementById('userAuth');
    if (!currentUser) {
        el.innerHTML = `<a href="/auth/discord" class="auth-link"><i class="fab fa-discord"></i> Login with Discord</a>`;
    } else {
        el.innerHTML = `
            <span style="color:#1DB954;font-weight:bold;font-size:1.1rem;">
                <i class="fab fa-discord"></i> ${currentUser.username}#${currentUser.discriminator}
            </span>
            <a href="/logout" class="auth-link logout-link">Logout</a>
        `;
    }
}

async function loadSongs() {
    try {
        const response = await fetch('/api/songs');
        const newSongs = await response.json();
        if (!Array.isArray(newSongs) || newSongs.length === 0) {
            songs = [];
            textures = [];
            render();
            return [];
        }
        // If song list changed, reload textures
        let changed = songs.length !== newSongs.length || songs.some((s, i) => s.id !== newSongs[i].id);
        songs = newSongs;
        if (changed) {
            textures = [];
            loadTextures().then(() => {
                render();
            });
        } else {
            render();
        }
        return songs;
    } catch (error) {
        console.error('Error loading songs:', error);
        songs = [];
        textures = [];
        render();
        return [];
    }
}

async function checkUserRating(songId) {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`/api/songs/${songId}/ratings`);
        const ratings = await response.json();
        const userRating = ratings.find(r => r.user_id === currentUser.id);
        
        if (userRating) {
            const userRatingInfo = document.getElementById(`user-rating-${songId}`);
            if (userRatingInfo) {
                const timestamp = formatTimestamp(userRating.created_at);
                userRatingInfo.innerHTML = `<i class="fas fa-check-circle"></i> You rated this ${userRating.rating}/7 ${timestamp}`;
                userRatingInfo.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error checking user rating:', error);
    }
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return 'on ' + date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

window.submitRating = async function(songId) {
    if (!currentUser) {
        alert('You must be logged in with Discord to rate.');
        return;
    }

    const card = document.querySelector(`[data-song-id="${songId}"]`);
    const ratingSlider = card.querySelector('.rating-slider');
    const reviewTextarea = card.querySelector('.review-textarea');
    const submitBtn = card.querySelector('.submit-btn');
    const successMsg = card.querySelector('.success-message');
    const errorMsg = card.querySelector('.error-message');

    const rating = parseInt(ratingSlider.value);
    const review = reviewTextarea.value.trim();

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    successMsg.style.display = 'none';
    errorMsg.style.display = 'none';

    try {
        const response = await fetch(`/api/songs/${songId}/rate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                rating: rating,
                review: review || null
            })
        });

        if (response.ok) {
            const result = await response.json();
            successMsg.innerHTML = `<i class="fas fa-check-circle"></i> Rating ${result.updated ? 'updated' : 'submitted'} successfully!`;
            successMsg.style.display = 'block';
            
            ratingSlider.value = 4;
            ratingSlider.nextElementSibling.textContent = '4';
            reviewTextarea.value = '';
            
            await checkUserRating(songId);
            setTimeout(async () => {
                const updated = await loadSongs();
                if (updated && updated.length > 0) {
                    renderCatalog();
                    for (const song of updated) {
                        await checkUserRating(song.id);
                    }
                }
            }, 1000);
        } else {
            const errorData = await response.json();
            errorMsg.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${errorData.error || 'Failed to submit rating'}`;
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        console.error('Error submitting rating:', error);
        errorMsg.innerHTML = '<i class="fas fa-exclamation-circle"></i> Network error. Please try again.';
        errorMsg.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-star"></i> Submit Rating';
    }
};

// ====== THREE.JS SLIDESHOW ======
const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    uniform sampler2D uTexture1;
    uniform sampler2D uTexture2;
    uniform float uProgress;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float noise(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float smoothNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(noise(i), noise(i + vec2(1.0, 0.0)), f.x),
            mix(noise(i + vec2(0.0, 1.0)), noise(i + vec2(1.0, 1.0)), f.x),
            f.y
        );
    }

    void main() {
        vec2 center = vec2(0.5, 0.5);
        vec2 p = vUv * uResolution;
        vec2 sphereCenter = center * uResolution;
        
        float maxRadius = length(uResolution) * 0.85;
        float bubbleRadius = uProgress * maxRadius;
        float dist = length(p - sphereCenter);
        
        float inside = smoothstep(bubbleRadius + 3.0, bubbleRadius - 3.0, dist);
        
        vec2 direction = (dist > 0.0) ? (p - sphereCenter) / dist : vec2(0.0);
        float normalizedDist = dist / max(bubbleRadius, 0.001);
        
        float time = uProgress * 5.0;
        vec2 distortion = vec2(
            smoothNoise(vUv * 100.0 + time * 0.3),
            smoothNoise(vUv * 100.0 + time * 0.2 + 50.0)
        ) - 0.5;
        
        distortion *= 0.02 * smoothstep(0.3, 1.0, normalizedDist) * inside;
        
        float aberration = 0.01 * pow(normalizedDist, 1.2) * inside;
        vec2 uv_r = vUv + direction * aberration * 1.2 + distortion;
        vec2 uv_g = vUv + direction * aberration * 0.2 + distortion;
        vec2 uv_b = vUv - direction * aberration * 0.8 + distortion;
        
        vec4 color2;
        if (inside > 0.0) {
            float r = texture2D(uTexture2, uv_r).r;
            float g = texture2D(uTexture2, uv_g).g;
            float b = texture2D(uTexture2, uv_b).b;
            color2 = vec4(r, g, b, 1.0);
        } else {
            color2 = texture2D(uTexture2, vUv);
        }
        
        vec4 color1 = texture2D(uTexture1, vUv);
        gl_FragColor = mix(color1, color2, inside);
    }
`;

function initThree() {
    const canvas = document.querySelector('.webgl-canvas');
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    shaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture1: { value: null },
            uTexture2: { value: null },
            uProgress: { value: 0 },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        },
        vertexShader,
        fragmentShader
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, shaderMaterial);
    scene.add(mesh);

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

async function loadTextures() {
    const loader = new THREE.TextureLoader();
    textures = [];
    for (const song of songs) {
        if (song.image_url) {
            try {
                const texture = await new Promise((resolve, reject) => {
                    loader.load(song.image_url, (tex) => {
                        tex.minFilter = tex.magFilter = THREE.LinearFilter;
                        resolve(tex);
                    }, undefined, reject);
                });
                textures.push(texture);
            } catch (error) {
                console.error('Error loading texture:', error);
                textures.push(createFallbackTexture());
            }
        } else {
            textures.push(createFallbackTexture());
        }
    }
    if (textures.length >= 2) {
        shaderMaterial.uniforms.uTexture1.value = textures[0];
        shaderMaterial.uniforms.uTexture2.value = textures[1];
    }

    function createFallbackTexture() {
        // Create a simple gray fallback texture
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#444';
        ctx.fillRect(0, 0, size, size);
        return new THREE.CanvasTexture(canvas);
    }
}

function createNavigation() {
    const nav = document.getElementById('slidesNav');
    nav.innerHTML = '';
    
    songs.forEach((song, i) => {
        const item = document.createElement('div');
        item.className = `slide-nav-item ${i === 0 ? 'active' : ''}`;
        item.innerHTML = `
            <div class="slide-progress-line"><div class="slide-progress-fill"></div></div>
            <div class="slide-nav-title">${song.title || 'Unknown'}</div>
        `;
        item.onclick = (e) => {
            e.stopPropagation();
            if (i !== currentSlideIndex && !isTransitioning && currentView === 'slideshow') {
                navigateToSlide(i);
            }
        };
        nav.appendChild(item);
    });

    document.getElementById('slideTotal').textContent = String(songs.length).padStart(2, '0');
}

function navigateToSlide(targetIndex) {
    if (isTransitioning || targetIndex === currentSlideIndex || textures.length < 2) return;
    
    isTransitioning = true;
    shaderMaterial.uniforms.uTexture1.value = textures[currentSlideIndex];
    shaderMaterial.uniforms.uTexture2.value = textures[targetIndex];
    
    currentSlideIndex = targetIndex;
    updateCounter();
    updateNavigation();
    
    const startTime = performance.now();
    const duration = 2000;
    
    function animateTransition(time) {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        shaderMaterial.uniforms.uProgress.value = eased;
        
        if (progress < 1) {
            requestAnimationFrame(animateTransition);
        } else {
            shaderMaterial.uniforms.uProgress.value = 0;
            shaderMaterial.uniforms.uTexture1.value = textures[targetIndex];
            isTransitioning = false;
        }
    }
    
    requestAnimationFrame(animateTransition);
}

function updateCounter() {
    document.getElementById('slideCounter').textContent = String(currentSlideIndex + 1).padStart(2, '0');
}

function updateNavigation() {
    document.querySelectorAll('.slide-nav-item').forEach((item, i) => {
        item.classList.toggle('active', i === currentSlideIndex);
    });
}

function render() {
    // Always update navigation and counter
    updateCounter();
    updateNavigation();
    const info = document.getElementById('slideInfo');
    if (!info) return;
    if (!songs.length) {
        info.innerHTML = '';
        return;
    }
    const song = songs[currentSlideIndex];
    let loginMsg = !currentUser ? '<div style="color:#e74c3c;font-weight:bold;margin-bottom:10px;">Login with Discord to rate!</div>' : '';
    let ratingCount = song.rating_count || 0;
    info.innerHTML = `
        <div class="slide-song-title">${song.title || 'Unknown Title'}</div>
        <div class="slide-song-artist">${song.artist || 'Unknown Artist'}</div>
        <div class="slide-song-actions">
            <a href="${song.spotify_url}" target="_blank" class="slide-song-link"><i class="fab fa-spotify"></i> Open in Spotify</a>
        </div>
        <div class="slide-song-rating">
            ${loginMsg}
            <label class="rating-label">Rate this song (1-7):</label>
            <div class="rating-input">
                <input type="range" class="rating-slider" min="1" max="7" value="4" data-song-id="${song.id}" oninput="this.nextElementSibling.textContent = this.value" ${!currentUser ? 'disabled' : ''}>
                <span class="rating-value">4</span>
            </div>
            <label class="rating-label">Optional Review:</label>
            <textarea class="review-textarea" placeholder="Share your thoughts about this song..." data-song-id="${song.id}" ${!currentUser ? 'disabled' : ''}></textarea>
            <button class="submit-btn" onclick="submitRating(${song.id})" ${!currentUser ? 'disabled' : ''}><i class="fas fa-star"></i> Submit Rating</button>
            <div class="success-message" id="success-${song.id}"></div>
            <div class="error-message" id="error-${song.id}"></div>
            <div class="user-rating-info" id="user-rating-${song.id}"></div>
            <div class="stats" style="margin-top:10px;color:#bdbdbd;font-size:0.95rem;"><i class="fas fa-users"></i> ${ratingCount} rating${ratingCount !== 1 ? 's' : ''}</div>
        </div>
    `;
    checkUserRating(song.id);
}

function setupSlideshowEvents() {
    // Next/Prev buttons
    document.getElementById('slideNext').onclick = () => {
        if (!isTransitioning && songs.length > 1) {
            let next = (currentSlideIndex + 1) % songs.length;
            navigateToSlide(next);
        }
    };
    document.getElementById('slidePrev').onclick = () => {
        if (!isTransitioning && songs.length > 1) {
            let prev = (currentSlideIndex - 1 + songs.length) % songs.length;
            navigateToSlide(prev);
        }
    };
    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
        if (currentView !== 'slideshow' || isTransitioning) return;
        if (e.key === 'ArrowRight') {
            let next = (currentSlideIndex + 1) % songs.length;
            navigateToSlide(next);
        } else if (e.key === 'ArrowLeft') {
            let prev = (currentSlideIndex - 1 + songs.length) % songs.length;
            navigateToSlide(prev);
        }
    });
}

async function initializeSlideshow() {
    await fetchUser();
    await loadSongs();
    await initThree();
    await loadTextures();
    createNavigation();
    updateCounter();
    updateNavigation();
    render();
    setupSlideshowEvents();
}

document.addEventListener('DOMContentLoaded', initializeSlideshow);