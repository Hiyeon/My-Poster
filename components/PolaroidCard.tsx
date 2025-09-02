/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

type ImageStatus = 'pending' | 'done' | 'error';

interface MoviePosterCardProps {
    imageUrl?: string;
    caption: string;
    status: ImageStatus;
    error?: string;
    onRegenerate?: (caption: string) => void;
    onDownload?: (caption: string) => void;
    onClick?: () => void;
    isEnlarged?: boolean;
}

const LoadingSpinner = () => (
    <div className="flex items-center justify-center h-full">
        <svg className="animate-spin h-8 w-8 text-neutral-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

const ErrorDisplay = ({ message }: { message?: string }) => (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
         <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="mt-2 text-xs text-neutral-400">{message || "Failed to generate."}</p>
    </div>
);

const Placeholder = ({ text }: { text: string }) => (
    <div className="flex flex-col items-center justify-center h-full text-neutral-500 group-hover:text-yellow-400 transition-colors duration-300 border-2 border-dashed border-neutral-600 m-4 rounded-md">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2h3m2-4h6a2 2 0 012 2v3a2 2 0 01-2 2h-6m-2-4H5m11 11v-2m0-4v-2m0-4V5M9 5v2m0 4v2m0 4v2m-4-2h3m-3 4h3m-3-4H5m4 0h3" />
        </svg>
        <span className="font-permanent-marker text-xl text-center px-4">{text}</span>
        <span className="font-permanent-marker text-base text-neutral-600 mt-2">Click to Upload</span>
    </div>
);


const MoviePosterCard: React.FC<MoviePosterCardProps> = ({ imageUrl, caption, status, error, onRegenerate, onDownload, onClick, isEnlarged }) => {
    const [isImageLoaded, setIsImageLoaded] = useState(false);

    useEffect(() => {
        setIsImageLoaded(false);
    }, [imageUrl]);

    return (
        <div
            onClick={onClick}
            className={cn(
                "relative group/card bg-neutral-800 flex flex-col items-center justify-center aspect-[2/3] w-full rounded-lg overflow-hidden shadow-2xl shadow-black/50 poster-texture",
                onClick && !isEnlarged && "cursor-pointer transition-transform duration-300 hover:!scale-105"
            )}
        >
            {status === 'pending' && <LoadingSpinner />}
            {status === 'error' && <ErrorDisplay message={error}/>}
            {status === 'done' && !imageUrl && <Placeholder text={caption} />}
            {status === 'done' && imageUrl && (
                <>
                    <img
                        key={imageUrl}
                        src={imageUrl}
                        alt={caption}
                        onLoad={() => setIsImageLoaded(true)}
                        className={cn(
                            "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
                            isImageLoaded ? "opacity-100" : "opacity-0"
                        )}
                    />
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-10">
                        <p className={cn(
                            "font-permanent-marker text-2xl text-white text-center truncate [text-shadow:2px_2px_4px_rgba(0,0,0,0.8)]"
                        )}>
                            {caption}
                        </p>
                    </div>
                </>
            )}

            {/* Action Buttons */}
            <div className={cn(
                "absolute top-2 right-2 z-20 flex flex-col gap-2 transition-opacity duration-300",
                isEnlarged ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 focus-within:opacity-100"
            )}>
                {onDownload && status === 'done' && imageUrl && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDownload(caption); }}
                        className="p-2 bg-black/50 rounded-full text-white hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white"
                        aria-label={`Download image for ${caption}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    </button>
                )}
                 {onRegenerate && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRegenerate(caption); }}
                        disabled={status === 'pending'}
                        className="p-2 bg-black/50 rounded-full text-white hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={`Regenerate image for ${caption}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.899 2.186l-1.42.71a5.002 5.002 0 00-8.479-1.554H10a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm12 14a1 1 0 01-1-1v-2.101a7.002 7.002 0 01-11.899-2.186l1.42-.71a5.002 5.002 0 008.479 1.554H10a1 1 0 110-2h6a1 1 0 011 1v6a1 1 0 01-1 1z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
};

export default MoviePosterCard;