document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('medicineImage');
    const fileLabel = document.getElementById('fileLabel');
    const uploadForm = document.getElementById('uploadForm');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const loading = document.getElementById('loading');
    const resultsSection = document.getElementById('resultsSection');
    const submitBtn = document.getElementById('submitBtn');

    // Display selected file name and preview the image
    fileInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            fileLabel.textContent = file.name;

            // Create a preview of the image
            const reader = new FileReader();
            reader.onload = function (e) {
                imagePreview.src = e.target.result;
                imagePreviewContainer.style.display = 'block';
            }
            reader.readAsDataURL(file);
        } else {
            fileLabel.textContent = 'Choose an image';
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
            // --- Client-Side Image Compression ---
            const compressedBlob = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1200; // Define a reasonable max width
                    const MAX_HEIGHT = 1200; // Define a reasonable max height
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

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Compress to JPEG with 0.7 quality to ensure it slides under 1MB API limit
                    canvas.toBlob(
                        (blob) => {
                            if (blob) resolve(blob);
                            else reject(new Error("Canvas to Blob failed"));
                        },
                        'image/jpeg',
                        0.7
                    );
                };
                img.onerror = reject;
                img.src = URL.createObjectURL(file);
            });

            // Create form data to send to our backend with the compressed blob
            const formData = new FormData();
            // Important: add '.jpg' extension so node's multer keeps a valid extension structure
            formData.append('medicineImage', compressedBlob, 'compressed.jpg');
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
