// Application State
let session = null;
const LATENT_DIM = 100;
const GRID_SIZE = 9; // 3x3 grid
const IMG_SIZE = 64;

// DOM Elements
const modelSelect = document.getElementById('model-select');
const mutationSlider = document.getElementById('mutation-slider');
const mutationValue = document.getElementById('mutation-value');
const generateBtn = document.getElementById('generate-btn');
const gridContainer = document.getElementById('grid');
const loadingOverlay = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');

// Initialize
async function init() {
    // Setup event listeners
    mutationSlider.addEventListener('input', (e) => {
        mutationValue.textContent = e.target.value;
    });

    modelSelect.addEventListener('change', async (e) => {
        await loadModel(e.target.value);
        generateGrid(); // Regenerate with new model
    });

    generateBtn.addEventListener('click', () => {
        generateGrid(); // Fully random grid
    });

    // Load initial model
    await loadModel(modelSelect.value);

    // Generate initial grid
    generateGrid();
}

async function loadModel(modelName) {
    showLoading(`Loading Model (${modelName})...`);
    try {
        // Release previous session if exists
        if (session) {
            session = null;
        }

        // Create new ONNX Runtime session
        // Note: wasm execution provider is used by default in browser
        session = await ort.InferenceSession.create(modelName, { executionProviders: ['wasm'] });
        console.log("Model loaded successfully:", modelName);
        console.log("Input names:", session.inputNames);
        console.log("Output names:", session.outputNames);

    } catch (e) {
        console.error("Failed to load model:", e);
        alert(`Failed to load model ${modelName}. Make sure the file exists and is a valid ONNX model. Error: ` + e.message);
    } finally {
        hideLoading();
    }
}

// Generate random normal distribution (approximation)
function randomNormal() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function generateNoiseVector(baseNoise = null, mutationRate = 0) {
    const noise = new Float32Array(LATENT_DIM);
    for (let i = 0; i < LATENT_DIM; i++) {
        if (baseNoise && mutationRate > 0) {
            // Interactive evolution: base + small random mutation
            noise[i] = baseNoise[i] + (randomNormal() * mutationRate);
        } else {
            // Completely random
            noise[i] = randomNormal();
        }
    }
    return noise;
}

async function runInference(noiseVector) {
    if (!session) return null;

    try {
        // The PyTorch model expects input shape [batch_size, 100, 1, 1]
        // The Float32Array represents the flattened data
        const inputName = session.inputNames[0];
        const tensor = new ort.Tensor('float32', noiseVector, [1, LATENT_DIM, 1, 1]);

        const feeds = {};
        feeds[inputName] = tensor;

        const results = await session.run(feeds);
        const outputName = session.outputNames[0];
        return results[outputName];
    } catch (e) {
        console.error("Inference error:", e);
        return null;
    }
}

function renderToCanvas(outputTensor, canvas) {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(IMG_SIZE, IMG_SIZE);

    // The PyTorch model output is typically shape [1, 3, 64, 64] (NCHW)
    // and values are in range [-1, 1] because of Tanh activation.
    const data = outputTensor.data;
    const channelSize = IMG_SIZE * IMG_SIZE;

    for (let y = 0; y < IMG_SIZE; y++) {
        for (let x = 0; x < IMG_SIZE; x++) {
            const pixelIdx = y * IMG_SIZE + x;

            // Extract RGB channels (NCHW format: R channel first, then G, then B)
            const r = data[pixelIdx];
            const g = data[channelSize + pixelIdx];
            const b = data[2 * channelSize + pixelIdx];

            // Convert [-1, 1] back to [0, 255]
            const rVal = Math.max(0, Math.min(255, Math.round((r + 1) * 127.5)));
            const gVal = Math.max(0, Math.min(255, Math.round((g + 1) * 127.5)));
            const bVal = Math.max(0, Math.min(255, Math.round((b + 1) * 127.5)));

            // Set ImageData (RGBA format)
            const imgIdx = (y * IMG_SIZE + x) * 4;
            imgData.data[imgIdx] = rVal;
            imgData.data[imgIdx + 1] = gVal;
            imgData.data[imgIdx + 2] = bVal;
            imgData.data[imgIdx + 3] = 255; // Alpha
        }
    }

    ctx.putImageData(imgData, 0, 0);
}

async function generateGrid(baseNoise = null) {
    if (!session) return;

    showLoading(baseNoise ? "Mutating variations..." : "Generating butterflies...");
    gridContainer.innerHTML = ''; // Clear grid

    const mutationRate = parseFloat(mutationSlider.value);

    // If baseNoise is provided, we want to keep the exact base as the first item
    // or the center item. Let's just generate N variations.
    // Actually, making the first one the exact parent is nice so the user sees it.

    for (let i = 0; i < GRID_SIZE; i++) {
        // First item is exactly the parent if Mutating
        const currentMutation = (baseNoise && i === 0) ? 0 : mutationRate;
        const noise = generateNoiseVector(baseNoise, currentMutation);

        const outputTensor = await runInference(noise);

        if (outputTensor) {
            // Create DOM elements
            const card = document.createElement('div');
            card.className = 'butterfly-card';
            card.title = "Click to mutate variations of this butterfly";

            const canvas = document.createElement('canvas');
            canvas.className = 'butterfly-canvas';
            canvas.width = IMG_SIZE;
            canvas.height = IMG_SIZE;

            renderToCanvas(outputTensor, canvas);

            // Add interaction: Click to mutate
            card.addEventListener('click', () => {
                generateGrid(noise);
            });

            card.appendChild(canvas);
            gridContainer.appendChild(card);
        }

        // Small delay to allow UI to update and not freeze the browser completely
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    hideLoading();
}

function showLoading(text) {
    loadingText.textContent = text;
    loadingOverlay.classList.add('active');
}

function hideLoading() {
    loadingOverlay.classList.remove('active');
}

// Start application
window.addEventListener('DOMContentLoaded', init);
