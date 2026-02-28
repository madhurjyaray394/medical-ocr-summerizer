document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('medicineImage');
    const fileLabel = document.getElementById('fileLabel');
    const uploadForm = document.getElementById('uploadForm');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const loading = document.getElementById('loading');
    const resultsSection = document.getElementById('resultsSection');
    const submitBtn = document.getElementById('submitBtn');

    let currentPreviewUrl = null;

    // Display selected file name and preview the image
    fileInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            fileLabel.textContent = file.name;

            // Free up memory from previous image preview
            if (currentPreviewUrl) {
                URL.revokeObjectURL(currentPreviewUrl);
            }

            // Create a memory-efficient preview URL (doesn't load entire file to RAM as base64)
            currentPreviewUrl = URL.createObjectURL(file);
            imagePreview.src = currentPreviewUrl;

            imagePreviewContainer.style.display = 'block';
        } else {
            fileLabel.textContent = 'Choose an image';
            imagePreview.src = ''; // Clear image reference
            imagePreviewContainer.style.display = 'none';
        }
    });

    // Handle form submission
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevent page from refreshing

        const file = fileInput.files[0];
        if (!file) {
            alert('Please select an image first.');
            return;
        }

        // Update UI to show loading/compressing state
        loading.style.display = 'block';
        document.querySelector('.loading-text').textContent = "Compressing & analyzing image... Please wait.";
        resultsSection.style.display = 'none';
        submitBtn.disabled = true;

        try {
            // Check file size. If it's > 300KB, use the canvas compression.
            let fileToSend = file;
            let fileName = file.name;
            const fileSizeMB = file.size / (1024 * 1024);

            if (fileSizeMB > 0.3) {
                // --- Client-Side Image Compression (Optimized for Mobile Memory) ---
                console.log(`File is ${fileSizeMB.toFixed(2)}MB, compressing...`);
                fileToSend = await new Promise((resolve, reject) => {
                    const img = new Image();
                    const objectUrl = URL.createObjectURL(file);

                    img.onload = () => {
                        // Immediately revoke the object URL to free up precious mobile RAM
                        URL.revokeObjectURL(objectUrl);

                        const canvas = document.createElement('canvas');
                        // Minimized max dimensions to save RAM during rendering
                        const MAX_WIDTH = 800;
                        const MAX_HEIGHT = 800;
                        let width = img.width;
                        let height = img.height;

                        if (width > height) {
                            if (width > MAX_WIDTH) {
                                height *= MAX_WIDTH / width;
                                width = MAX_WIDTH;
                            }
                        } else {
                            if (height > MAX_HEIGHT) {
                                width *= MAX_HEIGHT / height;
                                height = MAX_HEIGHT;
                            }
                        }

                        // Ensure dimensions are whole numbers
                        canvas.width = Math.floor(width);
                        canvas.height = Math.floor(height);
                        const ctx = canvas.getContext('2d');

                        // Use a background color just in case it's a transparent PNG
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                        // Compress to JPEG with 0.8 quality
                        canvas.toBlob(
                            (blob) => {
                                // Clear canvas memory explicitly
                                canvas.width = 0;
                                canvas.height = 0;

                                if (blob) resolve(blob);
                                else reject(new Error("Canvas to Blob failed"));
                            },
                            'image/jpeg',
                            0.8
                        );
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(objectUrl);
                        reject(new Error("Image failed to load for compression"));
                    };
                    img.src = objectUrl;
                });
                fileName = 'compressed.jpg';
            } else {
                console.log(`File is ${fileSizeMB.toFixed(2)}MB, skipping canvas compression to save memory.`);
            }

            // Create form data to send to our backend
            const formData = new FormData();
            formData.append('medicineImage', fileToSend, fileName);
            // Send the image to our local Node.js backend
            const response = await fetch('/api/scan', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                // Update UI with results
                document.getElementById('rawOcrText').textContent = data.extractedText || 'No text found';
                document.getElementById('medicineName').textContent = data.medicineName || 'Could not identify name';
                document.getElementById('medicineUsage').textContent = data.usage || 'Information not available';
                document.getElementById('medicineWarnings').textContent = data.warnings || 'Information not available';

                // Show results section
                resultsSection.style.display = 'block';
            } else {
                throw new Error(data.error || 'Failed to process image');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred: ' + error.message);
        } finally {
            // Reset loading state
            loading.style.display = 'none';
            submitBtn.disabled = false;
        }
    });
});
