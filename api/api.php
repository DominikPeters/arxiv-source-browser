<?php
/**
 * arXiv Source Downloader and Converter
 * 
 * Takes an arXiv URL, extracts the paper ID, downloads the source,
 * converts from tar.gz to zip, and serves it to the user.
 */

// Error reporting for debugging (remove in production)
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Set memory and time limits for handling large files
ini_set('memory_limit', '256M');
set_time_limit(120);

/**
 * Extract paper ID from various arXiv URL formats
 */
function extractArxivId($url) {
    $patterns = [
        '/arxiv\.org\/abs\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/',
        '/arxiv\.org\/pdf\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/',
        '/arxiv\.org\/html\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/',
        '/arxiv\.org\/src\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/',
        // Also handle old format IDs
        '/arxiv\.org\/(?:abs|pdf|html|src)\/([a-z-]+\/[0-9]{7}(?:v[0-9]+)?)/',
    ];
    
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $url, $matches)) {
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
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (compatible; arXiv-Downloader/1.0)');
    
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
        // Fallback to system tar command if available
        if (function_exists('exec')) {
            $command = "tar -xzf " . escapeshellarg($tarFile) . " -C " . escapeshellarg($extractDir);
            exec($command, $output, $returnVar);
            return $returnVar === 0;
        }
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
    // Get URL parameter
    $arxivUrl = $_GET['url'] ?? '';
    
    if (empty($arxivUrl)) {
        http_response_code(400);
        die('Error: No arXiv URL provided. Usage: ?url=https://arxiv.org/abs/2402.10439');
    }
    
    // Extract paper ID
    $paperId = extractArxivId($arxivUrl);
    if (!$paperId) {
        http_response_code(400);
        die('Error: Invalid arXiv URL format');
    }
    
    // Create temporary directory for processing
    $tempDir = __DIR__ . '/temp_' . uniqid();
    mkdir($tempDir, 0755, true);
    
    // Construct source URL
    $sourceUrl = 'https://arxiv.org/src/' . $paperId;
    $tarFile = $tempDir . '/source.tar.gz';
    $extractDir = $tempDir . '/extracted';
    $zipFile = $tempDir . '/arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';
    
    // Download source file
    if (!downloadFile($sourceUrl, $tarFile)) {
        deleteDirectory($tempDir);
        http_response_code(404);
        die('Error: Could not download source file from arXiv');
    }
    
    // Extract tar.gz
    if (!extractTarGz($tarFile, $extractDir)) {
        deleteDirectory($tempDir);
        http_response_code(500);
        die('Error: Could not extract tar.gz file');
    }
    
    // Create ZIP file
    if (!createZipFromDirectory($extractDir, $zipFile)) {
        deleteDirectory($tempDir);
        http_response_code(500);
        die('Error: Could not create ZIP file');
    }
    
    // Serve the ZIP file
    $zipFilename = 'arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';
    serveFile($zipFile, $zipFilename);
    
    // Cleanup (this won't execute due to exit in serveFile, but good practice)
    deleteDirectory($tempDir);
    
} catch (Exception $e) {
    // Cleanup on error
    if (isset($tempDir) && is_dir($tempDir)) {
        deleteDirectory($tempDir);
    }
    
    http_response_code(500);
    die('Error: ' . $e->getMessage());
}
?>