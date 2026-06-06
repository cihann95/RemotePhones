"""Simple ML model for predicting app usage patterns."""

from __future__ import annotations

import logging
import pickle
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)


class AppUsagePredictor:
    """
    Simple ML model for predicting app usage patterns.
    
    This model predicts the likelihood of an app being launched
    based on historical usage patterns and device context.
    """
    
    def __init__(self, model_path: Optional[Path] = None):
        """
        Initialize the predictor.
        
        Args:
            model_path: Path to saved model file. If None, creates new model.
        """
        self.model = RandomForestRegressor(n_estimators=10, random_state=42)
        self.scaler = StandardScaler()
        self.is_trained = False
        
        if model_path and model_path.exists():
            self.load_model(model_path)
    
    def prepare_features(self, 
                        usage_history: List[Dict[str, Any]],
                        device_context: Dict[str, Any]) -> np.ndarray:
        """
        Prepare features for ML model from usage history and device context.
        
        Args:
            usage_history: List of usage records
            device_context: Current device state information
            
        Returns:
            Feature vector as numpy array
        """
        if not usage_history:
            # Return default features if no history
            return np.zeros(10).reshape(1, -1)
        
        # Extract temporal features
        timestamps = [record.get('timestamp', 0) for record in usage_history[-10:]]
        usage_counts = [record.get('app_launches', 0) for record in usage_history[-10:]]
        
        # Basic statistical features
        features = []
        
        # Usage statistics
        if usage_counts:
            features.extend([
                np.mean(usage_counts),
                np.std(usage_counts) if len(usage_counts) > 1 else 0.0,
                np.min(usage_counts),
                np.max(usage_counts),
                usage_counts[-1] if usage_counts else 0  # Most recent
            ])
        else:
            features.extend([0.0, 0.0, 0.0, 0.0, 0.0])
        
        # Temporal features
        if len(timestamps) >= 2:
            time_diffs = np.diff(timestamps)
            features.extend([
                np.mean(time_diffs) if len(time_diffs) > 0 else 0.0,
                np.std(time_diffs) if len(time_diffs) > 1 else 0.0
            ])
        else:
            features.extend([0.0, 0.0])
        
        # Device context features
        features.extend([
            device_context.get('battery_level', 50) / 100.0,  # Normalize to 0-1
            device_context.get('is_charging', 0),
            device_context.get('time_of_day', 12) / 24.0,  # Normalize hour
            device_context.get('day_of_week', 1) / 7.0  # Normalize day
        ])
        
        # Pad or truncate to fixed size
        target_size = 11
        if len(features) < target_size:
            features.extend([0.0] * (target_size - len(features)))
        else:
            features = features[:target_size]
            
        return np.array(features).reshape(1, -1)
    
    def train(self, 
              training_data: List[Tuple[List[Dict[str, Any]], Dict[str, Any], float]]) -> None:
        """
        Train the model on historical data.
        
        Args:
            training_data: List of tuples (usage_history, device_context, target_value)
                          where target_value is the actual app launches in next period
        """
        if not training_data:
            logger.warning("No training data provided")
            return
        
        # Prepare features and targets
        X_list = []
        y_list = []
        
        for usage_history, device_context, target in training_data:
            features = self.prepare_features(usage_history, device_context)
            X_list.append(features.flatten())
            y_list.append(target)
        
        X = np.array(X_list)
        y = np.array(y_list)
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X)
        
        # Train model
        self.model.fit(X_scaled, y)
        self.is_trained = True
        
        logger.info(f"AppUsagePredictor trained on {len(training_data)} samples")
    
    def predict(self, 
                usage_history: List[Dict[str, Any]],
                device_context: Dict[str, Any]) -> float:
        """
        Predict app usage likelihood.
        
        Args:
            usage_history: Historical usage data
            device_context: Current device context
            
        Returns:
            Predicted usage score (higher = more likely to be used)
        """
        if not self.is_trained:
            # Return heuristic prediction if model not trained
            return self._heuristic_prediction(usage_history, device_context)
        
        try:
            features = self.prepare_features(usage_history, device_context)
            features_scaled = self.scaler.transform(features)
            prediction = self.model.predict(features_scaled)[0]
            return max(0.0, float(prediction))  # Ensure non-negative
        except Exception as e:
            logger.error(f"Prediction failed: {e}")
            return self._heuristic_prediction(usage_history, device_context)
    
    def _heuristic_prediction(self, 
                             usage_history: List[Dict[str, Any]],
                             device_context: Dict[str, Any]) -> float:
        """Fallback heuristic prediction when ML model is not available."""
        if not usage_history:
            return 0.5  # Default medium likelihood
        
        # Simple heuristic: based on recent usage and time of day
        recent_usage = usage_history[-1].get('app_launches', 0) if usage_history else 0
        time_of_day = device_context.get('time_of_day', 12)
        
        # Higher likelihood during typical usage hours (8 AM - 10 PM)
        time_factor = 1.0 if 8 <= time_of_day <= 22 else 0.5
        
        # Normalize recent usage (assuming max 10 launches per period)
        usage_factor = min(recent_usage / 10.0, 1.0)
        
        return (usage_factor * 0.7 + time_factor * 0.3)
    
    def save_model(self, model_path: Path) -> None:
        """
        Save the trained model to disk.
        
        Args:
            model_path: Path where to save the model
        """
        if not self.is_trained:
            logger.warning("Cannot save untrained model")
            return
        
        model_path.parent.mkdir(parents=True, exist_ok=True)
        
        model_data = {
            'model': self.model,
            'scaler': self.scaler,
            'is_trained': self.is_trained
        }
        
        with open(model_path, 'wb') as f:
            pickle.dump(model_data, f)
        
        logger.info(f"Model saved to {model_path}")
    
    def load_model(self, model_path: Path) -> None:
        """
        Load a trained model from disk.
        
        Args:
            model_path: Path to the saved model file
        """
        try:
            with open(model_path, 'rb') as f:
                model_data = pickle.load(f)
            
            self.model = model_data['model']
            self.scaler = model_data['scaler']
            self.is_trained = model_data['is_trained']
            
            logger.info(f"Model loaded from {model_path}")
        except Exception as e:
            logger.error(f"Failed to load model from {model_path}: {e}")
            # Keep default untrained model


# Global predictor instance
usage_predictor = AppUsagePredictor()

__all__ = ['AppUsagePredictor', 'usage_predictor']