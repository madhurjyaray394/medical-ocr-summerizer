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

        // Create form data to send to our backend
        const formData = new FormData();
        formData.append('medicineImage', file);

        // Update UI to show loading state
        loading.style.display = 'block';
        resultsSection.style.display = 'none';
        submitBtn.disabled = true;

        try {
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
