<?php
/**
 * arXiv Source Downloader and Converter
 *
 * Supports:
 * - Legacy source download: ?url=<id-or-arxiv-url>
 * - Explicit source download: ?action=source&id=<versioned-id>
 * - Version metadata: ?action=versions&id=<id-or-arxiv-url>
 * - Lightweight metadata: ?action=meta&id=<id-or-arxiv-url>
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
    $input = trim((string) $input);
    if ($input === '') {
        return false;
    }

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
 * Normalize ID into base/version tuple.
 */
function normalizeArxivId($input) {
    $id = extractArxivId($input);
    if (!$id) {
        return false;
    }

    if (preg_match('/^(.*)v([0-9]+)$/', $id, $matches)) {
        return [
            'id' => $id,
            'baseId' => $matches[1],
            'version' => (int) $matches[2],
        ];
    }

    return [
        'id' => $id,
        'baseId' => $id,
        'version' => null,
    ];
}

/**
 * Download text from URL with error handling.
 */
function fetchText($url) {
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

    return $data;
}

/**
 * Download file from URL with error handling
 */
function downloadFile($url, $destination) {
    $data = fetchText($url);
    if ($data === false) {
        return false;
    }
    return file_put_contents($destination, $data) !== false;
}

/**
 * Extract tar.gz file to a directory
 * Also handles plain gzip files (single file submissions)
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
        // PharData failed - might be a plain gzip file (single file submission)
        // Try to decompress as plain gzip
        return extractPlainGzip($tarFile, $extractDir);
    }
}

/**
 * Extract a plain gzip file (not tar.gz) to a directory
 * arXiv serves single-file submissions as plain .gz files
 */
function extractPlainGzip($gzFile, $extractDir) {
    // Try to get the original filename from gzip header
    $originalName = getGzipOriginalName($gzFile);
    if (!$originalName) {
        // Fall back to main.tex if we can't determine the original name
        $originalName = 'main.tex';
    }

    // Create extraction directory if needed
    if (!is_dir($extractDir)) {
        mkdir($extractDir, 0755, true);
    }

    // Decompress the gzip file
    $gzHandle = gzopen($gzFile, 'rb');
    if (!$gzHandle) {
        return false;
    }

    $outputPath = $extractDir . '/' . $originalName;
    $outHandle = fopen($outputPath, 'wb');
    if (!$outHandle) {
        gzclose($gzHandle);
        return false;
    }

    while (!gzeof($gzHandle)) {
        $chunk = gzread($gzHandle, 8192);
        fwrite($outHandle, $chunk);
    }

    gzclose($gzHandle);
    fclose($outHandle);

    return file_exists($outputPath) && filesize($outputPath) > 0;
}

/**
 * Extract original filename from gzip header
 * Gzip format stores the original filename if FNAME flag is set
 */
function getGzipOriginalName($gzFile) {
    $handle = fopen($gzFile, 'rb');
    if (!$handle) {
        return null;
    }

    // Read gzip header (minimum 10 bytes)
    $header = fread($handle, 10);
    if (strlen($header) < 10) {
        fclose($handle);
        return null;
    }

    // Check gzip magic number (0x1f 0x8b)
    if (ord($header[0]) !== 0x1f || ord($header[1]) !== 0x8b) {
        fclose($handle);
        return null;
    }

    $flags = ord($header[3]);

    // FEXTRA (bit 2) - skip extra field if present
    if ($flags & 0x04) {
        $extraLen = unpack('v', fread($handle, 2))[1];
        fseek($handle, $extraLen, SEEK_CUR);
    }

    // FNAME (bit 3) - original filename is present
    if ($flags & 0x08) {
        $name = '';
        while (($char = fgetc($handle)) !== false && $char !== "\0") {
            $name .= $char;
        }
        fclose($handle);
        // Sanitize filename - only allow safe characters
        $name = basename($name);
        if (preg_match('/^[a-zA-Z0-9._-]+$/', $name)) {
            return $name;
        }
    }

    fclose($handle);
    return null;
}

/**
 * Create ZIP file from directory
 */
function createZipFromDirectory($sourceDir, $zipFile) {
    if (!extension_loaded('zip')) {
        return false;
    }

    $zip = new ZipArchive();
    if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        return false;
    }

    // Check if the extracted directory contains a single subdirectory
    // If so, use that as the source to avoid nested folder structure
    $items = array_values(array_diff(scandir($sourceDir), ['.', '..']));
    if (count($items) === 1 && is_dir($sourceDir . '/' . $items[0])) {
        $sourceDir = $sourceDir . '/' . $items[0];
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

    return $zip->close();
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

/**
 * Return JSON payload and terminate.
 */
function jsonResponse($statusCode, $payload) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Fetch and cache source ZIP for an arXiv ID.
 */
function getOrBuildSourceZip($paperId) {
    $cachedFilePath = getCachedFilePath($paperId);
    if (isCacheValid($cachedFilePath)) {
        touch($cachedFilePath);
        return $cachedFilePath;
    }

    $tempDir = __DIR__ . '/temp_' . uniqid();
    mkdir($tempDir, 0755, true);
    addTempDirForCleanup($tempDir);

    try {
        $sourceUrl = 'https://arxiv.org/src/' . $paperId;
        $tarFile = $tempDir . '/source.tar.gz';
        $extractDir = $tempDir . '/extracted';
        $tempZipFile = $tempDir . '/arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';

        if (!downloadFile($sourceUrl, $tarFile)) {
            throw new Exception('Could not download source file from arXiv');
        }

        if (!extractTarGz($tarFile, $extractDir)) {
            throw new Exception('Could not extract tar.gz file');
        }

        if (!createZipFromDirectory($extractDir, $tempZipFile)) {
            throw new Exception('Could not create ZIP file');
        }

        if (!rename($tempZipFile, $cachedFilePath)) {
            throw new Exception('Could not save file to cache');
        }

        manageCacheSize();
        return $cachedFilePath;
    } finally {
        cleanupTempFiles($tempDir);
    }
}

/**
 * Parse versions from the arXiv abs page submission-history block.
 */
function fetchSubmissionVersions($baseId) {
    $html = fetchText('https://arxiv.org/abs/' . $baseId);
    if ($html === false) {
        throw new Exception('Could not fetch arXiv abstract page');
    }

    if (!preg_match('/<div class="submission-history">(.*?)<\/div>/s', $html, $matches)) {
        throw new Exception('Submission history block not found');
    }

    $historyHtml = $matches[1];
    $versionPattern = '/<strong>\s*(?:<a[^>]*>)?\[v([0-9]+)\](?:<\/a>)?\s*<\/strong>\s*([^<]+?)\s*\(([^)]+)\)\s*<br\/?>/si';
    preg_match_all($versionPattern, $historyHtml, $allMatches, PREG_SET_ORDER);

    if (count($allMatches) === 0) {
        throw new Exception('No submission versions found in history');
    }

    $versions = [];
    foreach ($allMatches as $match) {
        $version = (int) $match[1];
        $submittedUtc = trim(html_entity_decode($match[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $sizeLabel = trim(html_entity_decode($match[3], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $versions[$version] = [
            'version' => $version,
            'id' => $baseId . 'v' . $version,
            'submittedUtc' => $submittedUtc,
            'sizeLabel' => $sizeLabel,
        ];
    }

    ksort($versions, SORT_NUMERIC);
    $orderedVersions = array_values($versions);

    return [
        'versions' => $orderedVersions,
        'latestVersion' => $orderedVersions[count($orderedVersions) - 1]['version'],
    ];
}

/**
 * Parse title from abs page for metadata payload.
 */
function fetchPaperTitle($id) {
    $html = fetchText('https://arxiv.org/abs/' . $id);
    if ($html === false) {
        return null;
    }

    if (preg_match('/<title>\s*\[[^\]]+\]\s*(.*?)<\/title>/si', $html, $matches)) {
        return trim(html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }
    return null;
}

/**
 * Resolve id/url from request parameters.
 */
function resolveArxivInput($preferredKey = 'id') {
    $raw = $_GET[$preferredKey] ?? '';
    if ($raw === '' && $preferredKey !== 'url') {
        $raw = $_GET['url'] ?? '';
    }
    return $raw;
}

// Main execution
try {
    registerCleanupHandler();
    cleanupOldTempDirs();

    $action = $_GET['action'] ?? '';

    // Legacy behavior: no action means source download from ?url=
    if ($action === '') {
        $arxivInput = $_GET['url'] ?? '';
        if (empty($arxivInput)) {
            http_response_code(400);
            die('Error: No arXiv URL or ID provided. Usage: ?url=https://arxiv.org/abs/1706.03762 or ?url=1706.03762');
        }

        $normalized = normalizeArxivId($arxivInput);
        if (!$normalized) {
            http_response_code(400);
            die('Error: Invalid arXiv URL or ID format');
        }

        $paperId = $normalized['id'];
        $cachedFilePath = getOrBuildSourceZip($paperId);
        $zipFilename = 'arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';
        serveFile($cachedFilePath, $zipFilename);
    }

    if ($action === 'source') {
        $arxivInput = resolveArxivInput('id');
        if (empty($arxivInput)) {
            jsonResponse(400, ['ok' => false, 'error' => 'Missing id parameter']);
        }

        $normalized = normalizeArxivId($arxivInput);
        if (!$normalized) {
            jsonResponse(400, ['ok' => false, 'error' => 'Invalid arXiv URL or ID format']);
        }

        $paperId = $normalized['id'];
        $cachedFilePath = getOrBuildSourceZip($paperId);
        $zipFilename = 'arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';
        serveFile($cachedFilePath, $zipFilename);
    }

    if ($action === 'versions') {
        $arxivInput = resolveArxivInput('id');
        if (empty($arxivInput)) {
            jsonResponse(400, ['ok' => false, 'error' => 'Missing id parameter']);
        }

        $normalized = normalizeArxivId($arxivInput);
        if (!$normalized) {
            jsonResponse(400, ['ok' => false, 'error' => 'Invalid arXiv URL or ID format']);
        }

        $baseId = $normalized['baseId'];
        $result = fetchSubmissionVersions($baseId);
        jsonResponse(200, [
            'ok' => true,
            'baseId' => $baseId,
            'versions' => $result['versions'],
            'latestVersion' => $result['latestVersion'],
        ]);
    }

    if ($action === 'meta') {
        $arxivInput = resolveArxivInput('id');
        if (empty($arxivInput)) {
            jsonResponse(400, ['ok' => false, 'error' => 'Missing id parameter']);
        }

        $normalized = normalizeArxivId($arxivInput);
        if (!$normalized) {
            jsonResponse(400, ['ok' => false, 'error' => 'Invalid arXiv URL or ID format']);
        }

        $title = fetchPaperTitle($normalized['id']);
        jsonResponse(200, [
            'ok' => true,
            'id' => $normalized['id'],
            'baseId' => $normalized['baseId'],
            'version' => $normalized['version'],
            'title' => $title,
        ]);
    }

    jsonResponse(400, ['ok' => false, 'error' => 'Unsupported action']);
} catch (Exception $e) {
    jsonResponse(500, ['ok' => false, 'error' => $e->getMessage()]);
}

