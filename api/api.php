<?php
/**
 * arXiv Source Downloader and Converter
 * 
 * Takes an arXiv URL, extracts the paper ID, downloads the source,
 * converts from tar.gz to zip, and serves it to the user.
 */

// Error reporting disabled for production security
error_reporting(0);
ini_set('display_errors', 0);

// Set memory and time limits for handling large files
ini_set('memory_limit', '256M');
set_time_limit(120);

/**
 * Extract paper ID from arXiv URL or validate direct ID input
 */
function extractArxivId($input) {
    // First check if input is already a valid arXiv ID
    $idPatterns = [
        '/^([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)$/',  // New format: 2402.10439 or 2402.10439v1
        '/^([a-z-]+\/[0-9]{7}(?:v[0-9]+)?)$/',     // Old format: math-ph/0501023 or math-ph/0501023v1
    ];
    
    foreach ($idPatterns as $pattern) {
        if (preg_match($pattern, $input, $matches)) {
            return $matches[1];
        }
    }
    
    // If not a direct ID, try to extract from URL
    $urlPatterns = [
        '/arxiv\.org\/abs\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/',
        '/arxiv\.org\/pdf\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/',
        '/arxiv\.org\/html\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/',
        '/arxiv\.org\/src\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/',
        // Also handle old format IDs in URLs
        '/arxiv\.org\/(?:abs|pdf|html|src)\/([a-z-]+\/[0-9]{7}(?:v[0-9]+)?)/',
    ];
    
    foreach ($urlPatterns as $pattern) {
        if (preg_match($pattern, $input, $matches)) {
            return $matches[1];
        }
    }
    
    return false;
}

/**
 * Download file from URL with error handling
 */
function downloadFile($url, $destination) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (compatible; arxiv-source-browser.github.io)');
    
    $data = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200 || $data === false) {
        return false;
    }
    
    return file_put_contents($destination, $data) !== false;
}

/**
 * Extract tar.gz file to a directory
 */
function extractTarGz($tarFile, $extractDir) {
    if (!file_exists($tarFile)) {
        return false;
    }
    
    // Create extraction directory
    if (!is_dir($extractDir)) {
        mkdir($extractDir, 0755, true);
    }
    
    // Use PharData to extract tar.gz
    try {
        $phar = new PharData($tarFile);
        $phar->extractTo($extractDir);
        return true;
    } catch (Exception $e) {
        // No shell fallback for security - rely only on PharData
        return false;
    }
}

/**
 * Create ZIP file from directory
 */
function createZipFromDirectory($sourceDir, $zipFile) {
    if (!extension_loaded('zip')) {
        return false;
    }
    
    $zip = new ZipArchive();
    if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
        return false;
    }
    
    // Check if the extracted directory contains a single subdirectory
    // If so, use that as the source to avoid nested folder structure
    $items = array_diff(scandir($sourceDir), ['.', '..']);
    if (count($items) === 1 && is_dir($sourceDir . '/' . $items[0])) {
        $sourceDir = $sourceDir . '/' . array_values($items)[0];
    }
    
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    
    foreach ($iterator as $file) {
        $filePath = $file->getRealPath();
        $relativePath = substr($filePath, strlen($sourceDir) + 1);
        
        if ($file->isDir()) {
            $zip->addEmptyDir($relativePath);
        } else {
            $zip->addFile($filePath, $relativePath);
        }
    }
    
    $result = $zip->close();
    return $result;
}

/**
 * Recursively delete directory and its contents
 */
function deleteDirectory($dir) {
    if (!is_dir($dir)) {
        return;
    }
    
    $files = array_diff(scandir($dir), ['.', '..']);
    foreach ($files as $file) {
        $path = $dir . '/' . $file;
        is_dir($path) ? deleteDirectory($path) : unlink($path);
    }
    rmdir($dir);
}

/**
 * Get cache directory path and ensure it exists
 */
function getCacheDir() {
    $cacheDir = __DIR__ . '/cache';
    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0755, true);
    }
    return $cacheDir;
}

/**
 * Get cached file path for a given arXiv ID
 */
function getCachedFilePath($paperId) {
    $cacheDir = getCacheDir();
    $filename = 'arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';
    return $cacheDir . '/' . $filename;
}

/**
 * Check if a cached file exists and is valid
 */
function isCacheValid($filePath) {
    return file_exists($filePath) && filesize($filePath) > 0;
}

/**
 * Manage cache size by keeping only the 100 most recent files
 */
function manageCacheSize() {
    $cacheDir = getCacheDir();
    $files = [];
    
    // Get all zip files in cache directory with their modification times
    if ($handle = opendir($cacheDir)) {
        while (false !== ($entry = readdir($handle))) {
            if (pathinfo($entry, PATHINFO_EXTENSION) === 'zip') {
                $filePath = $cacheDir . '/' . $entry;
                $files[] = [
                    'path' => $filePath,
                    'mtime' => filemtime($filePath)
                ];
            }
        }
        closedir($handle);
    }
    
    // Sort by modification time (newest first)
    usort($files, function($a, $b) {
        return $b['mtime'] - $a['mtime'];
    });
    
    // Delete files beyond the 100 most recent
    if (count($files) > 100) {
        for ($i = 100; $i < count($files); $i++) {
            unlink($files[$i]['path']);
        }
    }
}

/**
 * Global variable to track temp directories for cleanup
 */
$tempDirsToCleanup = [];

/**
 * Register shutdown function to ensure cleanup happens
 */
function registerCleanupHandler() {
    global $tempDirsToCleanup;
    register_shutdown_function(function() use (&$tempDirsToCleanup) {
        foreach ($tempDirsToCleanup as $tempDir) {
            cleanupTempFiles($tempDir);
        }
    });
}

/**
 * Add temp directory to cleanup list
 */
function addTempDirForCleanup($tempDir) {
    global $tempDirsToCleanup;
    $tempDirsToCleanup[] = $tempDir;
}

/**
 * Cleanup temporary files and directory
 */
function cleanupTempFiles($tempDir) {
    if (is_dir($tempDir)) {
        try {
            deleteDirectory($tempDir);
        } catch (Exception $e) {
            error_log("Failed to cleanup temp directory $tempDir: " . $e->getMessage());
        }
    }
}

/**
 * Clean up old temporary directories (older than 1 hour)
 */
function cleanupOldTempDirs() {
    $apiDir = __DIR__;
    $cutoffTime = time() - 3600; // 1 hour ago
    
    if ($handle = opendir($apiDir)) {
        while (false !== ($entry = readdir($handle))) {
            if (strpos($entry, 'temp_') === 0 && is_dir($apiDir . '/' . $entry)) {
                $dirPath = $apiDir . '/' . $entry;
                $dirTime = filemtime($dirPath);
                
                if ($dirTime < $cutoffTime) {
                    cleanupTempFiles($dirPath);
                }
            }
        }
        closedir($handle);
    }
}

/**
 * Serve file for download
 */
function serveFile($filePath, $filename, $contentType = 'application/zip') {
    if (!file_exists($filePath)) {
        http_response_code(404);
        die('File not found');
    }
    
    header('Content-Type: ' . $contentType);
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($filePath));
    header('Cache-Control: no-cache, must-revalidate');
    
    readfile($filePath);
    exit;
}

// Main execution
try {
    // Register cleanup handler to ensure temp files are deleted even on fatal errors
    registerCleanupHandler();
    
    // Clean up old temp directories periodically
    cleanupOldTempDirs();
    
    // Get URL parameter (can be URL or direct ID)
    $arxivInput = $_GET['url'] ?? '';
    
    if (empty($arxivInput)) {
        http_response_code(400);
        die('Error: No arXiv URL or ID provided. Usage: ?url=https://arxiv.org/abs/1706.03762 or ?url=1706.03762');
    }
    
    // Extract paper ID
    $paperId = extractArxivId($arxivInput);
    if (!$paperId) {
        http_response_code(400);
        die('Error: Invalid arXiv URL or ID format');
    }
    
    // Check if file is already cached
    $cachedFilePath = getCachedFilePath($paperId);
    if (isCacheValid($cachedFilePath)) {
        // Update file modification time to mark as recently accessed
        touch($cachedFilePath);
        
        // Serve cached file
        $zipFilename = 'arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';
        serveFile($cachedFilePath, $zipFilename);
    }
    
    // File not cached, need to download and process
    $tempDir = __DIR__ . '/temp_' . uniqid();
    
    try {
        // Create temporary directory for processing
        mkdir($tempDir, 0755, true);
        
        // Register this temp directory for cleanup
        addTempDirForCleanup($tempDir);
        
        // Construct source URL
        $sourceUrl = 'https://arxiv.org/src/' . $paperId;
        $tarFile = $tempDir . '/source.tar.gz';
        $extractDir = $tempDir . '/extracted';
        $tempZipFile = $tempDir . '/arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';
        
        // Download source file
        if (!downloadFile($sourceUrl, $tarFile)) {
            throw new Exception('Could not download source file from arXiv');
        }
        
        // Extract tar.gz
        if (!extractTarGz($tarFile, $extractDir)) {
            throw new Exception('Could not extract tar.gz file');
        }
        
        // Create ZIP file in temp location
        if (!createZipFromDirectory($extractDir, $tempZipFile)) {
            throw new Exception('Could not create ZIP file');
        }
        
        // Move ZIP file to cache
        if (!rename($tempZipFile, $cachedFilePath)) {
            throw new Exception('Could not save file to cache');
        }
        
        // Manage cache size (keep only 100 most recent files)
        manageCacheSize();
        
        // Cleanup temp files before serving (since serveFile calls exit)
        cleanupTempFiles($tempDir);
        
        // Serve the cached file
        $zipFilename = 'arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';
        serveFile($cachedFilePath, $zipFilename);
        
    } finally {
        // Always cleanup temporary files
        cleanupTempFiles($tempDir);
    }
    
} catch (Exception $e) {
    // Cleanup on error
    if (isset($tempDir)) {
        cleanupTempFiles($tempDir);
    }
    
    http_response_code(500);
    die('Error: ' . $e->getMessage());
}
?>