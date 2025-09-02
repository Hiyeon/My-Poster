/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, ChangeEvent, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generatePosterImage } from './services/geminiService';
import MoviePosterCard from './components/PolaroidCard';
import { createAlbumPage } from './lib/albumUtils';
import Footer from './components/Footer';

const GENRES = ['Teen', 'Action', 'Thriller', 'Romance', 'Fantasy', 'Academy'];

const GHOST_POLAROIDS_CONFIG = [
  { initial: { x: "-150%", y: "-100%", rotate: -30 }, transition: { delay: 0.2 } },
  { initial: { x: "150%", y: "-80%", rotate: 25 }, transition: { delay: 0.4 } },
  { initial: { x: "-120%", y: "120%", rotate: 45 }, transition: { delay: 0.6 } },
  { initial: { x: "180%", y: "90%", rotate: -20 }, transition: { delay: 0.8 } },
  { initial: { x: "0%", y: "-200%", rotate: 0 }, transition: { delay: 0.5 } },
  { initial: { x: "150%", y: "150%", rotate: 15 }, transition: { delay: 0.7 } },
];

type ImageStatus = 'pending' | 'done' | 'error';
interface GeneratedImage {
    status: ImageStatus;
    url?: string;
    error?: string;
}

const primaryButtonClasses = "font-permanent-marker text-xl text-center text-black bg-yellow-400 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:-rotate-2 hover:bg-yellow-300 shadow-[2px_2px_0px_2px_rgba(0,0,0,0.2)]";
const secondaryButtonClasses = "font-permanent-marker text-xl text-center text-white bg-white/10 backdrop-blur-sm border-2 border-white/80 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:rotate-2 hover:bg-white hover:text-black";

async function preprocessImageToPosterRatio(imageDataUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const posterAspectRatio = 2 / 3;
            const imageAspectRatio = img.width / img.height;

            // Use a fixed high resolution for the canvas to ensure quality
            const targetWidth = 1024;
            const targetHeight = 1536; // 1024 * 1.5 = 2:3 ratio

            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }

            // Black background to act as padding
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            let drawWidth, drawHeight, x, y;

            // Fit image within the canvas, maintaining aspect ratio
            if (imageAspectRatio > posterAspectRatio) {
                // Image is wider than the poster canvas
                drawWidth = canvas.width;
                drawHeight = drawWidth / imageAspectRatio;
                x = 0;
                y = (canvas.height - drawHeight) / 2;
            } else {
                // Image is taller than or same aspect ratio as the poster canvas
                drawHeight = canvas.height;
                drawWidth = drawHeight * imageAspectRatio;
                x = (canvas.width - drawWidth) / 2;
                y = 0;
            }

            ctx.drawImage(img, x, y, drawWidth, drawHeight);
            // Return as JPEG for smaller file size
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = () => reject(new Error('Failed to load image for preprocessing.'));
        img.src = imageDataUrl;
    });
}


function getGenrePrompt(genre: string): string {
    const commonInstructions = "Your task is to creatively transform the entire provided image into a movie poster. The image is already in a perfect vertical 2:3 aspect ratio. Your goal is to reimagine the whole scene, including any black bars from padding, into a cohesive movie poster in the specified genre style. Do not simply place the subject on a new background; instead, artistically integrate and transform all elements of the original picture. Based on these requirements, ";

    switch (genre.toLowerCase()) {
        case 'teen':
            return `${commonInstructions}create a movie poster styled after a mid-2000s teen drama like 'Mean Girls' or 'Gossip Girl'. The main subject from the photo should be the central character, styled in a fashionable preppy look (think blazers, plaid skirts, varsity sweaters). The setting is an ivy-covered campus of a prestigious prep school. Use a pink and glossy color palette, sharp typography for the title, and include taglines about secrets, status, or popularity.`;
        case 'action':
            return `${commonInstructions}turn the main subject in this photo into the hero of a blockbuster action movie poster. The poster must be gritty and dramatic. Feature explosions, smoke, and a dark, intense color palette (teals and oranges). The subject should have a determined expression. Add a bold, metallic movie title.`;
        case 'thriller':
            return `${commonInstructions}design a suspenseful thriller movie poster featuring the main subject from the photo as the central figure. Use a dark, moody atmosphere with high contrast lighting and shadows. The subject's expression should be fearful or mysterious. Incorporate unsettling elements in the background. The movie title should be in a sharp, tense font.`;
        case 'romance':
            return `${commonInstructions}design a whimsical and charming romantic comedy movie poster, inspired by films like 'About Time' or 'What If'. Place the main subject from the photo in a cozy, everyday setting like a coffee shop or a city park. The atmosphere should be warm, light, and feel-good, with a soft, natural color palette. The subject should have a sweet, slightly quirky expression. Use a friendly, handwritten-style font for the movie title.`;
        case 'fantasy':
            return `${commonInstructions}reimagine the main subject in the photo as the hero of an epic fantasy adventure in the style of 'The Lord of the Rings'. Place them on a dramatic, sweeping landscape like a mountain pass or ancient ruins. The scale should be grand and awe-inspiring. Use a rich, cinematic color palette with dramatic lighting. The movie title should be in an elegant, epic serif font.`;
        case 'academy':
            return `${commonInstructions}create a movie poster with a 'dark academia' aesthetic for a film about a magical academy. The main subject is a student. The scene is set inside a vast, ancient library within a gothic castle, lit by moonlight filtering through arched windows and the glow of magical artifacts or floating books. The atmosphere is mysterious, scholarly, and slightly melancholic. Use a palette of deep browns, rich blacks, and muted golds, with soft, glowing magical light as a key element. The title should be elegant and serifed.`;
        default:
            return `${commonInstructions}create a movie poster of the main subject in this image in the style of a ${genre} film.`;
    }
}

function App() {
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [appState, setAppState] = useState<'idle' | 'image-uploaded' | 'generating' | 'results-shown'>('idle');
    const [enlargedGenre, setEnlargedGenre] = useState<string | null>(null);

    const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setUploadedImage(reader.result as string);
                setAppState('image-uploaded');
                setGeneratedImages({}); // Clear previous results
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGenerateClick = async () => {
        if (!uploadedImage) return;

        setIsLoading(true);
        setAppState('generating');
        
        const processedImage = await preprocessImageToPosterRatio(uploadedImage);

        const initialImages: Record<string, GeneratedImage> = {};
        GENRES.forEach(genre => {
            initialImages[genre] = { status: 'pending' };
        });
        setGeneratedImages(initialImages);

        const concurrencyLimit = 2;
        const genresQueue = [...GENRES];

        const processGenre = async (genre: string) => {
            try {
                const prompt = getGenrePrompt(genre);
                const resultUrl = await generatePosterImage(processedImage, prompt);
                setGeneratedImages(prev => ({
                    ...prev,
                    [genre]: { status: 'done', url: resultUrl },
                }));
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
                setGeneratedImages(prev => ({
                    ...prev,
                    [genre]: { status: 'error', error: errorMessage },
                }));
                console.error(`Failed to generate image for ${genre}:`, err);
            }
        };

        const workers = Array(concurrencyLimit).fill(null).map(async () => {
            while (genresQueue.length > 0) {
                const genre = genresQueue.shift();
                if (genre) {
                    await processGenre(genre);
                }
            }
        });

        await Promise.all(workers);

        setIsLoading(false);
        setAppState('results-shown');
    };

    const handleRegenerateGenre = async (genre: string) => {
        if (!uploadedImage) return;

        if (generatedImages[genre]?.status === 'pending') {
            return;
        }
        
        console.log(`Regenerating image for ${genre}...`);

        setGeneratedImages(prev => ({
            ...prev,
            [genre]: { status: 'pending' },
        }));
        
        const processedImage = await preprocessImageToPosterRatio(uploadedImage);

        try {
            const prompt = getGenrePrompt(genre);
            const resultUrl = await generatePosterImage(processedImage, prompt);
            setGeneratedImages(prev => ({
                ...prev,
                [genre]: { status: 'done', url: resultUrl },
            }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setGeneratedImages(prev => ({
                ...prev,
                [genre]: { status: 'error', error: errorMessage },
            }));
            console.error(`Failed to regenerate image for ${genre}:`, err);
        }
    };
    
    const handleReset = () => {
        setUploadedImage(null);
        setGeneratedImages({});
        setAppState('idle');
    };

    const handleDownloadIndividualImage = (genre: string) => {
        const image = generatedImages[genre];
        if (image?.status === 'done' && image.url) {
            const link = document.createElement('a');
            link.href = image.url;
            link.download = `my-poster-${genre.toLowerCase()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const handleDownloadAlbum = async () => {
        setIsDownloading(true);
        try {
            const imageData = Object.entries(generatedImages)
                .filter(([, image]) => image.status === 'done' && image.url)
                .reduce((acc, [genre, image]) => {
                    acc[genre] = image!.url!;
                    return acc;
                }, {} as Record<string, string>);

            if (Object.keys(imageData).length < GENRES.length) {
                alert("Please wait for all posters to finish generating before downloading the set.");
                return;
            }

            const albumDataUrl = await createAlbumPage(imageData);

            const link = document.createElement('a');
            link.href = albumDataUrl;
            link.download = 'my-poster-collection.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Failed to create or download poster set:", error);
            alert("Sorry, there was an error creating your poster set. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <main className="bg-[#1a0505] text-neutral-200 min-h-screen w-full flex flex-col items-center p-4 pb-24 relative">
            <div className="absolute inset-0 w-full h-full bg-[radial-gradient(ellipse_at_center_top,_rgba(180,0,0,0.3)_0%,_transparent_70%)]"></div>
            
            <div className="z-10 flex flex-col items-center w-full max-w-5xl mx-auto flex-1">
                <div className="text-center my-10">
                    <h1 className="text-6xl md:text-8xl font-caveat font-bold text-neutral-100">My Poster</h1>
                    <p className="font-permanent-marker text-neutral-300 mt-2 text-xl tracking-wide">Become the star of your own movie poster.</p>
                </div>

                {appState === 'idle' && (
                     <div className="relative flex flex-col items-center justify-center w-full">
                        {GHOST_POLAROIDS_CONFIG.map((config, index) => (
                             <motion.div
                                key={index}
                                className="absolute w-80 aspect-[2/3] rounded-md bg-neutral-800/20 blur-sm"
                                initial={config.initial}
                                animate={{
                                    x: "0%", y: "0%", rotate: (Math.random() - 0.5) * 20,
                                    scale: 0,
                                    opacity: 0,
                                }}
                                transition={{
                                    ...config.transition,
                                    ease: "circOut",
                                    duration: 2,
                                }}
                            />
                        ))}
                        <motion.div
                             initial={{ opacity: 0, scale: 0.8 }}
                             animate={{ opacity: 1, scale: 1 }}
                             transition={{ delay: 2, duration: 0.8, type: 'spring' }}
                             className="flex flex-col items-center"
                        >
                            <label htmlFor="file-upload" className="cursor-pointer group transform hover:scale-105 transition-transform duration-300">
                                 <MoviePosterCard 
                                     caption="Your Starring Role Awaits"
                                     status="done"
                                 />
                            </label>
                            <input id="file-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} />
                            <p className="mt-8 font-permanent-marker text-neutral-500 text-center max-w-xs text-lg">
                                Click the poster to upload your photo and step into the spotlight.
                            </p>
                        </motion.div>
                    </div>
                )}

                {appState === 'image-uploaded' && uploadedImage && (
                    <div className="flex flex-col items-center gap-6">
                         <MoviePosterCard 
                            imageUrl={uploadedImage} 
                            caption="Your Headshot" 
                            status="done"
                         />
                         <div className="flex items-center gap-4 mt-4">
                            <button onClick={handleReset} className={secondaryButtonClasses}>
                                Different Photo
                            </button>
                            <button onClick={handleGenerateClick} className={primaryButtonClasses}>
                                Create Posters
                            </button>
                         </div>
                    </div>
                )}

                {(appState === 'generating' || appState === 'results-shown') && (
                     <>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-8 w-full px-4">
                            {GENRES.map((genre) => (
                                <motion.div key={genre} layoutId={`poster-card-${genre}`} className="w-full">
                                    <MoviePosterCard
                                        caption={genre}
                                        status={generatedImages[genre]?.status || 'pending'}
                                        imageUrl={generatedImages[genre]?.url}
                                        error={generatedImages[genre]?.error}
                                        onRegenerate={handleRegenerateGenre}
                                        onDownload={handleDownloadIndividualImage}
                                        onClick={() => generatedImages[genre]?.status === 'done' && setEnlargedGenre(genre)}
                                    />
                                </motion.div>
                            ))}
                        </div>
                        
                        <AnimatePresence>
                            {enlargedGenre && (
                                <motion.div
                                    className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
                                    onClick={() => setEnlargedGenre(null)}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    <motion.div
                                        layoutId={`poster-card-${enlargedGenre}`}
                                        className="w-full max-w-lg"
                                        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking on card
                                    >
                                        <MoviePosterCard
                                            isEnlarged
                                            caption={enlargedGenre}
                                            status={generatedImages[enlargedGenre]?.status || 'pending'}
                                            imageUrl={generatedImages[enlargedGenre]?.url}
                                            error={generatedImages[enlargedGenre]?.error}
                                            onRegenerate={handleRegenerateGenre}
                                            onDownload={handleDownloadIndividualImage}
                                            onClick={() => setEnlargedGenre(null)}
                                        />
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                         <div className="h-20 mt-8 flex items-center justify-center">
                            {appState === 'results-shown' && (
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <button 
                                        onClick={handleDownloadAlbum} 
                                        disabled={isDownloading} 
                                        className={`${primaryButtonClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {isDownloading ? 'Creating Set...' : 'Download Poster Set'}
                                    </button>
                                    <button onClick={handleReset} className={secondaryButtonClasses}>
                                        Start Over
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
            <Footer />
        </main>
    );
}

export default App;