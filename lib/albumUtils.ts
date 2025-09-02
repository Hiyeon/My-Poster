/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// Helper function to load an image and return it as an HTMLImageElement
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Setting crossOrigin is good practice for canvas operations, even with data URLs
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(new Error(`Failed to load image: ${src.substring(0, 50)}...`));
        img.src = src;
    });
}

/**
 * Creates a single "photo album" page image from a collection of genre posters.
 * @param imageData A record mapping genre strings to their image data URLs.
 * @returns A promise that resolves to a data URL of the generated album page (JPEG format).
 */
export async function createAlbumPage(imageData: Record<string, string>): Promise<string> {
    const canvas = document.createElement('canvas');
    // High-resolution canvas for good quality (A4-like ratio)
    const canvasWidth = 2480;
    const canvasHeight = 3508;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not get 2D canvas context');
    }

    // 1. Draw the album page background
    ctx.fillStyle = '#fdf5e6'; // A warm, parchment-like color
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. Draw the title
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';

    ctx.font = `bold 100px 'Caveat', cursive`;
    ctx.fillText('My Poster Collection', canvasWidth / 2, 150);

    ctx.font = `50px 'Roboto', sans-serif`;
    ctx.fillStyle = '#555';
    ctx.fillText('on Google AI Studio', canvasWidth / 2, 220);

    // 3. Load all the images concurrently
    const genres = Object.keys(imageData);
    const loadedImages = await Promise.all(
        Object.values(imageData).map(url => loadImage(url))
    );

    const imagesWithGenres = genres.map((genre, index) => ({
        genre,
        img: loadedImages[index],
    }));
    const itemCount = imagesWithGenres.length;

    // 4. Define grid layout and draw each poster
    const grid = { cols: 2, rows: Math.ceil(itemCount / 2), padding: 100 };
    const contentTopMargin = 300; // Space for the header
    const contentHeight = canvasHeight - contentTopMargin;
    const cellWidth = (canvasWidth - grid.padding * (grid.cols + 1)) / grid.cols;
    const cellHeight = (contentHeight - grid.padding * (grid.rows + 1)) / grid.rows;

    const posterAspectRatio = 2/3; // width / height
    const maxPosterWidth = cellWidth * 0.9;
    const maxPosterHeight = cellHeight * 0.9;

    let posterWidth = maxPosterWidth;
    let posterHeight = posterWidth / posterAspectRatio;

    if (posterHeight > maxPosterHeight) {
        posterHeight = maxPosterHeight;
        posterWidth = posterHeight * posterAspectRatio;
    }

    // Reverse the drawing order for a stacked effect
    const reversedImages = [...imagesWithGenres].reverse();
    reversedImages.forEach(({ genre, img }, reversedIndex) => {
        const index = imagesWithGenres.length - 1 - reversedIndex;

        const row = Math.floor(index / grid.cols);
        const col = index % grid.cols;

        // Check if this is the last row and if it has only one item
        const isLastRow = row === grid.rows - 1;
        const itemsInLastRow = itemCount % grid.cols === 0 ? grid.cols : itemCount % grid.cols;
        const isCentered = isLastRow && itemsInLastRow === 1;

        let x;
        if (isCentered) {
            // Center the single item on the canvas
            x = (canvasWidth - posterWidth) / 2;
        } else {
            x = grid.padding * (col + 1) + cellWidth * col + (cellWidth - posterWidth) / 2;
        }
        
        const y = contentTopMargin + grid.padding * (row + 1) + cellHeight * row + (cellHeight - posterHeight) / 2;
        
        ctx.save();
        ctx.translate(x + posterWidth / 2, y + posterHeight / 2);
        
        const rotation = (Math.random() - 0.5) * 0.1; // More subtle rotation
        ctx.rotate(rotation);
        
        // Poster shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetX = 10;
        ctx.shadowOffsetY = 15;

        // Aspect-fit image logic
        const imgAspectRatio = img.naturalWidth / img.naturalHeight;
        const posterContainerAspectRatio = posterWidth / posterHeight;

        let drawWidth, drawHeight;
        if (imgAspectRatio > posterContainerAspectRatio) {
            drawWidth = posterWidth;
            drawHeight = drawWidth / imgAspectRatio;
        } else {
            drawHeight = posterHeight;
            drawWidth = drawHeight * imgAspectRatio;
        }

        const imgX = -drawWidth / 2;
        const imgY = -drawHeight / 2;
        
        // Draw a black background in case the image doesn't fill the poster aspect ratio
        ctx.fillStyle = '#000';
        ctx.fillRect(-posterWidth / 2, -posterHeight / 2, posterWidth, posterHeight);
        
        // Draw the image centered
        ctx.drawImage(img, imgX, imgY, drawWidth, drawHeight);
        ctx.shadowColor = 'transparent'; // Reset shadow for text and gradient

        // Draw caption with gradient overlay
        const gradientHeight = 180;
        const gradientY = posterHeight / 2 - gradientHeight;
        const gradient = ctx.createLinearGradient(0, gradientY, 0, posterHeight / 2);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = gradient;
        ctx.fillRect(-posterWidth / 2, gradientY, posterWidth, gradientHeight);

        // Draw text on top of gradient
        ctx.fillStyle = '#fff';
        ctx.font = `70px 'Permanent Marker', cursive`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        const captionY = posterHeight / 2 - (gradientHeight / 2.5);
        ctx.fillText(genre, 0, captionY);
        
        ctx.restore();
    });

    return canvas.toDataURL('image/jpeg', 0.9);
}