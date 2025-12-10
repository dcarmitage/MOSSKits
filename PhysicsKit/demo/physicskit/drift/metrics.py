"""Drift metrics calculation and scoring.

Provides tools for measuring drift quality based on:
- Drift angle (body slip angle)
- Speed during drift
- Drift angle stability
- Counter-steering appropriateness
- Duration and distance
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import List, Optional

from physicskit.core.vector import Vector3


@dataclass
class DriftMetrics:
    """Current drift metrics."""
    # Primary drift quantities
    drift_angle: float = 0.0           # degrees (body slip angle)
    drift_angle_rate: float = 0.0      # degrees/s (how fast angle is changing)
    drift_direction: int = 0           # -1 = left, 0 = none, +1 = right

    # Vehicle state during drift
    speed: float = 0.0                 # m/s
    forward_speed: float = 0.0         # m/s (velocity along body axis)
    lateral_speed: float = 0.0         # m/s (velocity perpendicular to body)
    yaw_rate: float = 0.0              # rad/s

    # Driver inputs
    counter_steer_angle: float = 0.0   # degrees (steering opposing drift)
    throttle: float = 0.0
    is_counter_steering: bool = False

    # Drift status
    is_drifting: bool = False
    drift_duration: float = 0.0        # seconds
    drift_distance: float = 0.0        # meters

    # Quality metrics
    angle_stability: float = 0.0       # 0-1 (higher = more stable angle)
    speed_score: float = 0.0           # 0-1 (based on speed)
    angle_score: float = 0.0           # 0-1 (based on drift angle)
    overall_score: float = 0.0         # 0-100


class DriftAnalyzer:
    """Analyze and score drift performance.

    Tracks drift state over time and calculates quality metrics.
    """

    # Thresholds
    DRIFT_ANGLE_MIN: float = 10.0      # Minimum angle to consider drifting (degrees)
    DRIFT_ANGLE_OPTIMAL: float = 35.0  # Optimal drift angle for scoring
    DRIFT_ANGLE_MAX: float = 60.0      # Maximum reasonable drift angle
    DRIFT_SPEED_MIN: float = 5.0       # Minimum speed to consider drifting (m/s)

    def __init__(self):
        """Initialize drift analyzer."""
        # History for stability calculation
        self._angle_history: List[float] = []
        self._history_size: int = 30  # ~0.5s at 60Hz

        # Drift tracking
        self._drift_start_time: Optional[float] = None
        self._drift_distance: float = 0.0
        self._prev_drift_angle: float = 0.0

        # Smoothing
        self._smoothed_angle: float = 0.0
        self._smoothed_rate: float = 0.0

    def calculate_drift_angle(
        self,
        velocity: Vector3,
        orientation: float
    ) -> float:
        """Calculate drift angle (body slip angle).

        The drift angle is the angle between the vehicle's heading
        and its velocity direction.

        Args:
            velocity: Vehicle velocity vector (world frame)
            orientation: Vehicle heading (radians)

        Returns:
            Drift angle in degrees (positive = drifting right)
        """
        speed = velocity.magnitude_2d()
        if speed < 0.5:
            return 0.0

        # Velocity angle
        velocity_angle = math.atan2(velocity.y, velocity.x)

        # Slip angle is difference between velocity and heading
        slip_angle = velocity_angle - orientation

        # Normalize to [-pi, pi]
        while slip_angle > math.pi:
            slip_angle -= 2 * math.pi
        while slip_angle < -math.pi:
            slip_angle += 2 * math.pi

        return math.degrees(slip_angle)

    def calculate_drift_angle_from_local_velocity(
        self,
        forward_speed: float,
        lateral_speed: float
    ) -> float:
        """Calculate drift angle from local velocity components.

        Args:
            forward_speed: Speed along body X axis (m/s)
            lateral_speed: Speed along body Y axis (m/s)

        Returns:
            Drift angle in degrees
        """
        if abs(forward_speed) < 0.5:
            if abs(lateral_speed) < 0.5:
                return 0.0
            return math.copysign(90.0, lateral_speed)

        return math.degrees(math.atan2(lateral_speed, forward_speed))

    def is_counter_steering(
        self,
        steer_angle: float,
        drift_direction: int
    ) -> bool:
        """Check if driver is counter-steering.

        Counter-steering is when the steering direction opposes
        the drift direction, which is necessary to maintain the drift.

        Args:
            steer_angle: Steering angle (degrees, positive = right)
            drift_direction: -1 (left drift), 0 (no drift), +1 (right drift)

        Returns:
            True if counter-steering
        """
        if drift_direction == 0:
            return False

        # Counter-steering means steering opposite to drift
        # Drifting right -> steer left (negative)
        # Drifting left -> steer right (positive)
        return (drift_direction > 0 and steer_angle < -5.0) or \
               (drift_direction < 0 and steer_angle > 5.0)

    def calculate_angle_stability(self) -> float:
        """Calculate how stable the drift angle is.

        Returns:
            Stability score 0-1 (higher = more stable)
        """
        if len(self._angle_history) < 5:
            return 0.0

        # Calculate standard deviation of recent angles
        mean_angle = sum(self._angle_history) / len(self._angle_history)
        variance = sum((a - mean_angle) ** 2 for a in self._angle_history) / len(self._angle_history)
        std_dev = math.sqrt(variance)

        # Convert to stability score (lower std dev = higher stability)
        # 0 std dev = 1.0 stability, 20 deg std dev = ~0 stability
        stability = max(0.0, 1.0 - std_dev / 20.0)

        return stability

    def calculate_drift_score(
        self,
        metrics: DriftMetrics
    ) -> float:
        """Calculate overall drift quality score.

        Scoring factors:
        - Drift angle (optimal around 35 degrees)
        - Speed (higher = better)
        - Angle stability (smoother = better)
        - Counter-steering (appropriate = better)

        Args:
            metrics: Current drift metrics

        Returns:
            Score from 0 to 100
        """
        if not metrics.is_drifting:
            return 0.0

        # Angle score (peaks at optimal angle)
        angle = abs(metrics.drift_angle)
        if angle < self.DRIFT_ANGLE_MIN:
            angle_score = 0.0
        elif angle < self.DRIFT_ANGLE_OPTIMAL:
            # Ramp up from min to optimal
            angle_score = (angle - self.DRIFT_ANGLE_MIN) / (self.DRIFT_ANGLE_OPTIMAL - self.DRIFT_ANGLE_MIN)
        elif angle < self.DRIFT_ANGLE_MAX:
            # Slight decrease past optimal
            angle_score = 1.0 - 0.3 * (angle - self.DRIFT_ANGLE_OPTIMAL) / (self.DRIFT_ANGLE_MAX - self.DRIFT_ANGLE_OPTIMAL)
        else:
            # Too much angle
            angle_score = 0.5

        # Speed score (higher is better, caps at ~100 km/h)
        speed_kmh = metrics.speed * 3.6
        speed_score = min(1.0, speed_kmh / 80.0)

        # Stability score
        stability_score = metrics.angle_stability

        # Counter-steering bonus
        counter_steer_bonus = 0.1 if metrics.is_counter_steering else 0.0

        # Combine scores
        # Weights: angle 40%, speed 30%, stability 30%
        raw_score = (
            angle_score * 0.4 +
            speed_score * 0.3 +
            stability_score * 0.3 +
            counter_steer_bonus
        )

        # Scale to 0-100
        return min(100.0, raw_score * 100.0)

    def update(
        self,
        velocity: Vector3,
        orientation: float,
        steer_angle_deg: float,
        throttle: float,
        yaw_rate: float,
        speed: float,
        dt: float,
        sim_time: float
    ) -> DriftMetrics:
        """Update drift analysis with current vehicle state.

        Args:
            velocity: Vehicle velocity (world frame)
            orientation: Vehicle heading (radians)
            steer_angle_deg: Current steering angle (degrees)
            throttle: Throttle position (0-1)
            yaw_rate: Yaw rate (rad/s)
            speed: Vehicle speed (m/s)
            dt: Time step (seconds)
            sim_time: Current simulation time (seconds)

        Returns:
            Updated DriftMetrics
        """
        # Calculate drift angle
        drift_angle = self.calculate_drift_angle(velocity, orientation)

        # Smooth the angle
        alpha = min(1.0, dt * 10)  # ~0.1s time constant
        self._smoothed_angle += (drift_angle - self._smoothed_angle) * alpha

        # Calculate rate of change
        if dt > 0:
            raw_rate = (drift_angle - self._prev_drift_angle) / dt
            self._smoothed_rate += (raw_rate - self._smoothed_rate) * alpha
        self._prev_drift_angle = drift_angle

        # Update history for stability
        self._angle_history.append(abs(drift_angle))
        if len(self._angle_history) > self._history_size:
            self._angle_history.pop(0)

        # Determine drift direction
        if abs(drift_angle) > self.DRIFT_ANGLE_MIN:
            drift_direction = 1 if drift_angle > 0 else -1
        else:
            drift_direction = 0

        # Check if drifting
        is_drifting = (
            abs(drift_angle) > self.DRIFT_ANGLE_MIN and
            speed > self.DRIFT_SPEED_MIN
        )

        # Track drift duration and distance
        if is_drifting:
            if self._drift_start_time is None:
                self._drift_start_time = sim_time
                self._drift_distance = 0.0
            drift_duration = sim_time - self._drift_start_time
            self._drift_distance += speed * dt
        else:
            self._drift_start_time = None
            drift_duration = 0.0
            self._drift_distance = 0.0

        # Local velocity for forward/lateral
        forward_speed = velocity.magnitude() * math.cos(math.radians(drift_angle))
        lateral_speed = velocity.magnitude() * math.sin(math.radians(drift_angle))

        # Check counter-steering
        is_counter_steering = self.is_counter_steering(steer_angle_deg, drift_direction)

        # Calculate stability
        stability = self.calculate_angle_stability()

        # Build metrics
        metrics = DriftMetrics(
            drift_angle=drift_angle,
            drift_angle_rate=self._smoothed_rate,
            drift_direction=drift_direction,
            speed=speed,
            forward_speed=forward_speed,
            lateral_speed=lateral_speed,
            yaw_rate=yaw_rate,
            counter_steer_angle=steer_angle_deg if is_counter_steering else 0.0,
            throttle=throttle,
            is_counter_steering=is_counter_steering,
            is_drifting=is_drifting,
            drift_duration=drift_duration,
            drift_distance=self._drift_distance,
            angle_stability=stability
        )

        # Calculate scores
        metrics.angle_score = abs(drift_angle) / self.DRIFT_ANGLE_OPTIMAL if is_drifting else 0.0
        metrics.speed_score = min(1.0, speed * 3.6 / 80.0)
        metrics.overall_score = self.calculate_drift_score(metrics)

        return metrics

    def reset(self) -> None:
        """Reset analyzer state."""
        self._angle_history.clear()
        self._drift_start_time = None
        self._drift_distance = 0.0
        self._prev_drift_angle = 0.0
        self._smoothed_angle = 0.0
        self._smoothed_rate = 0.0
