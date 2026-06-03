"""Utility functions for AI/ML integration in Phone Farm system."""

from __future__ import annotations

import io
import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def preprocess_image_for_ml(
    image: Image.Image,
    target_size: Tuple[int, int] = (224, 224),
    normalize: bool = True
) -> np.ndarray:
    """
    Preprocess a PIL image for ML model input.
    
    Args:
        image: PIL Image to preprocess
        target_size: Target size (width, height) for resizing
        normalize: Whether to normalize pixel values to [0, 1]
        
    Returns:
        Preprocessed image as numpy array
    """
    # Resize image
    image_resized = image.resize(target_size)
    
    # Convert to numpy array
    img_array = np.array(image_resized)
    
    # Normalize if requested
    if normalize:
        img_array = img_array.astype(np.float32) / 255.0
    
    # Add batch dimension
    img_array = np.expand_dims(img_array, axis=0)
    
    return img_array


def extract_screen_features(
    screenshot_data: bytes,
    device_id: str
) -> Dict[str, Any]:
    """
    Extract basic features from a device screenshot for ML analysis.
    
    Args:
        screenshot_data: Raw screenshot bytes
        device_id: Device identifier
        
    Returns:
        Dictionary of extracted features
    """
    try:
        # Load image from bytes
        image = Image.open(io.BytesIO(screenshot_data))
        
        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Extract basic features
        features = {
            'device_id': device_id,
            'width': image.width,
            'height': image.height,
            'mode': image.mode,
            'format': image.format,
        }
        
        # Calculate color histogram features
        img_array = np.array(image)
        features.update(_extract_color_histogram_features(img_array))
        
        # Calculate texture features (simplified)
        features.update(_extract_texture_features(img_array))
        
        return features
        
    except Exception as exc:
        logger.error("Failed to extract screen features for %s: %s", device_id, exc)
        return {
            'device_id': device_id,
            'error': str(exc)
        }


def _extract_color_histogram_features(img_array: np.ndarray) -> Dict[str, Any]:
    """Extract color histogram features from image array."""
    features = {}
    
    # Calculate histogram for each channel
    for i, channel_name in enumerate(['red', 'green', 'blue']):
        if img_array.shape[2] > i:
            hist, _ = np.histogram(img_array[:, :, i], bins=16, range=(0, 256))
            # Normalize histogram
            hist = hist.astype(float) / hist.sum()
            features[f'{channel_name}_hist_mean'] = float(np.mean(hist))
            features[f'{channel_name}_hist_std'] = float(np.std(hist))
            features[f'{channel_name}_hist_entropy'] = float(-np.sum(hist * np.log(hist + 1e-10)))
    
    return features


def _extract_texture_features(img_array: np.ndarray) -> Dict[str, Any]:
    """Extract simplified texture features from image array."""
    features = {}
    
    # Convert to grayscale for texture analysis
    if img_array.shape[2] == 3:
        gray = np.mean(img_array, axis=2).astype(np.uint8)
    else:
        gray = img_array[:, :, 0]
    
    # Calculate basic texture statistics
    features['gray_mean'] = float(np.mean(gray))
    features['gray_std'] = float(np.std(gray))
    features['gray_entropy'] = float(-np.sum(
        np.histogram(gray, bins=256, range=(0, 256))[0].astype(float) / 
        (gray.size) * 
        np.log(np.histogram(gray, bins=256, range=(0, 256))[0].astype(float) / (gray.size) + 1e-10)
    ))
    
    # Calculate gradient magnitude (edge density)
    dx = np.diff(gray, axis=1)
    dy = np.diff(gray, axis=0)
    gradient_magnitude = np.sqrt(dx[:-1, :]**2 + dy[:, :-1]**2)
    features['edge_density'] = float(np.mean(gradient_magnitude))
    
    return features


def predict_app_usage_pattern(
    historical_data: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Simple prediction model for app usage patterns.
    
    Args:
        historical_data: List of historical usage records
        
    Returns:
        Prediction results
    """
    if not historical_data or len(historical_data) < 2:
        return {
            'prediction': 'insufficient_data',
            'confidence': 0.0
        }
    
    # Simple trend analysis - in reality this would be a proper ML model
    timestamps = [record.get('timestamp', 0) for record in historical_data]
    usage_counts = [record.get('app_launches', 0) for record in historical_data]
    
    if len(timestamps) >= 2:
        # Calculate simple linear trend
        x_vals = np.array(range(len(usage_counts)))
        y_vals = np.array(usage_counts)
        
        if len(x_vals) > 1:
            coeffs = np.polyfit(x_vals, y_vals, 1)
            trend_slope = coeffs[0]
            
            # Predict next value
            next_pred = np.polyval(coeffs, len(usage_counts))
            
            return {
                'prediction': max(0, int(next_pred)),
                'trend': 'increasing' if trend_slope > 0.1 else 'decreasing' if trend_slope < -0.1 else 'stable',
                'confidence': min(0.9, 0.5 + abs(trend_slope) * 10),  # Simple confidence metric
                'slope': float(trend_slope)
            }
    
    return {
        'prediction': 'unknown',
        'confidence': 0.0
    }


def detect_anomalies_in_device_behavior(
    current_metrics: Dict[str, Any],
    baseline_metrics: Dict[str, Any],
    threshold_multiplier: float = 2.0
) -> List[str]:
    """
    Detect anomalies in device behavior using simple statistical methods.
    
    Args:
        current_metrics: Current device metrics
        baseline_metrics: Baseline/normal metrics
        threshold_multiplier: How many standard deviations to consider anomalous
        
    Returns:
        List of anomaly descriptions
    """
    anomalies = []
    
    # Compare numeric metrics
    for key in current_metrics:
        if key in baseline_metrics and isinstance(current_metrics[key], (int, float)):
            current_val = current_metrics[key]
            baseline_val = baseline_metrics[key]
            
            # Skip if baseline is zero to avoid division by zero
            if baseline_val == 0:
                continue
                
            # Calculate relative difference
            if baseline_val != 0:
                relative_diff = abs(current_val - baseline_val) / abs(baseline_val)
                
                # If difference is large, flag as anomaly
                if relative_diff > threshold_multiplier:
                    anomalies.append(
                        f"Metric {key} deviates significantly: "
                        f"current={current_val:.2f}, baseline={baseline_val:.2f} "
                        f"(diff: {relative_diff*100:.1f}%)"
                    )
    
    return anomalies


__all__ = [
    'preprocess_image_for_ml',
    'extract_screen_features',
    'predict_app_usage_pattern',
    'detect_anomalies_in_device_behavior'
]