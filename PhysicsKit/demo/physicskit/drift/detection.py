"""Drift state detection and initiation analysis.

Detects different drift states and how drifts are initiated:
- Handbrake turn
- Power over (throttle-induced oversteer)
- Feint (weight transfer from steering)
- Braking drift (trail braking into corner)
"""

from __future__ import annotations
import math
from dataclasses import dataclass
from enum import Enum
from typing import Optional, List


class DriftState(Enum):
    """Current drift state."""
    STRAIGHT = "straight"           # Normal driving
    INITIATING = "initiating"       # Starting a drift
    DRIFTING = "drifting"          # Active drift
    TRANSITIONING = "transitioning" # Changing drift direction
    RECOVERING = "recovering"       # Coming out of drift


class DriftInitiation(Enum):
    """How the drift was initiated."""
    NONE = "none"
    HANDBRAKE = "handbrake"         # Handbrake pull
    POWER_OVER = "power_over"       # Throttle oversteer
    FEINT = "feint"                 # Scandinavian flick
    BRAKING = "braking"             # Trail braking
    LIFT_OFF = "lift_off"           # Lift-off oversteer
    CLUTCH_KICK = "clutch_kick"     # Sudden torque spike


@dataclass
class DetectionState:
    """Current detection state for telemetry."""
    drift_state: DriftState = DriftState.STRAIGHT
    initiation: DriftInitiation = DriftInitiation.NONE
    state_duration: float = 0.0     # Time in current state
    drift_angle: float = 0.0
    rear_slip_avg: float = 0.0      # Average rear slip angle
    front_slip_avg: float = 0.0     # Average front slip angle


class DriftDetector:
    """Detect drift states and initiation methods.

    Uses tire slip angles, inputs, and vehicle state to determine
    the current drift state and how drifts are initiated.
    """

    # Thresholds
    DRIFT_ANGLE_THRESHOLD: float = 10.0    # degrees
    SLIP_ANGLE_THRESHOLD: float = 8.0      # degrees
    HANDBRAKE_THRESHOLD: float = 0.5       # handbrake input
    THROTTLE_SPIKE_THRESHOLD: float = 0.7  # throttle for power over
    TRANSITION_ANGLE_RATE: float = 50.0    # deg/s for transition detection

    def __init__(self):
        """Initialize detector."""
        self._state = DriftState.STRAIGHT
        self._initiation = DriftInitiation.NONE
        self._state_start_time: float = 0.0
        self._current_time: float = 0.0

        # History for analysis
        self._throttle_history: List[float] = []
        self._steer_history: List[float] = []
        self._angle_history: List[float] = []
        self._history_size: int = 20  # ~0.33s at 60Hz

        # State tracking
        self._prev_drift_angle: float = 0.0
        self._prev_drift_direction: int = 0
        self._drift_direction: int = 0

    def _add_to_history(self, history: List[float], value: float) -> None:
        """Add value to history buffer."""
        history.append(value)
        if len(history) > self._history_size:
            history.pop(0)

    def _detect_initiation(
        self,
        handbrake: float,
        throttle: float,
        brake: float,
        steer: float,
        rear_slip_L: float,
        rear_slip_R: float,
        front_slip_L: float,
        front_slip_R: float
    ) -> DriftInitiation:
        """Detect how the drift was initiated."""
        rear_slip_avg = (abs(rear_slip_L) + abs(rear_slip_R)) / 2
        front_slip_avg = (abs(front_slip_L) + abs(front_slip_R)) / 2

        # Handbrake initiation - handbrake engaged with rear slip spike
        if handbrake > self.HANDBRAKE_THRESHOLD and rear_slip_avg > self.SLIP_ANGLE_THRESHOLD:
            return DriftInitiation.HANDBRAKE

        # Power over - high throttle causing rear slip
        if throttle > self.THROTTLE_SPIKE_THRESHOLD and rear_slip_avg > front_slip_avg + 5:
            return DriftInitiation.POWER_OVER

        # Braking drift - braking while rear slip increases
        if brake > 0.3 and rear_slip_avg > self.SLIP_ANGLE_THRESHOLD:
            return DriftInitiation.BRAKING

        # Feint detection - look for steering reversal pattern
        if len(self._steer_history) >= 10:
            # Check for sign change in steering
            recent_steer = self._steer_history[-5:]
            earlier_steer = self._steer_history[-10:-5]
            if recent_steer and earlier_steer:
                recent_avg = sum(recent_steer) / len(recent_steer)
                earlier_avg = sum(earlier_steer) / len(earlier_steer)
                if (recent_avg * earlier_avg < 0 and
                    abs(recent_avg - earlier_avg) > 0.5):
                    return DriftInitiation.FEINT

        # Lift-off - check throttle history for sudden drop
        if len(self._throttle_history) >= 5:
            recent_throttle = self._throttle_history[-3:]
            earlier_throttle = self._throttle_history[-6:-3]
            if recent_throttle and earlier_throttle:
                recent_avg = sum(recent_throttle) / len(recent_throttle)
                earlier_avg = sum(earlier_throttle) / len(earlier_throttle)
                if earlier_avg > 0.5 and recent_avg < 0.2:
                    return DriftInitiation.LIFT_OFF

        return DriftInitiation.NONE

    def _transition_state(
        self,
        new_state: DriftState,
        sim_time: float
    ) -> None:
        """Transition to a new state."""
        self._state = new_state
        self._state_start_time = sim_time

        # Reset initiation when going back to straight
        if new_state == DriftState.STRAIGHT:
            self._initiation = DriftInitiation.NONE

    def update(
        self,
        drift_angle: float,
        drift_angle_rate: float,
        speed: float,
        throttle: float,
        brake: float,
        steer: float,
        handbrake: float,
        rear_slip_L: float,
        rear_slip_R: float,
        front_slip_L: float,
        front_slip_R: float,
        sim_time: float
    ) -> DetectionState:
        """Update drift detection with current state.

        Args:
            drift_angle: Current drift angle (degrees)
            drift_angle_rate: Rate of drift angle change (deg/s)
            speed: Vehicle speed (m/s)
            throttle: Throttle input (0-1)
            brake: Brake input (0-1)
            steer: Steering input (-1 to 1)
            handbrake: Handbrake input (0-1)
            rear_slip_L: Rear left slip angle (degrees)
            rear_slip_R: Rear right slip angle (degrees)
            front_slip_L: Front left slip angle (degrees)
            front_slip_R: Front right slip angle (degrees)
            sim_time: Current simulation time (seconds)

        Returns:
            DetectionState with current drift state
        """
        self._current_time = sim_time

        # Update history
        self._add_to_history(self._throttle_history, throttle)
        self._add_to_history(self._steer_history, steer)
        self._add_to_history(self._angle_history, drift_angle)

        # Calculate averages
        rear_slip_avg = (abs(rear_slip_L) + abs(rear_slip_R)) / 2
        front_slip_avg = (abs(front_slip_L) + abs(front_slip_R)) / 2

        # Update drift direction
        if abs(drift_angle) > self.DRIFT_ANGLE_THRESHOLD:
            self._drift_direction = 1 if drift_angle > 0 else -1
        else:
            self._drift_direction = 0

        # Minimum speed for drift
        is_moving = speed > 3.0

        # State machine
        abs_angle = abs(drift_angle)

        if self._state == DriftState.STRAIGHT:
            # Check for drift initiation
            if is_moving and abs_angle > self.DRIFT_ANGLE_THRESHOLD:
                self._transition_state(DriftState.INITIATING, sim_time)
                self._initiation = self._detect_initiation(
                    handbrake, throttle, brake, steer,
                    rear_slip_L, rear_slip_R, front_slip_L, front_slip_R
                )

        elif self._state == DriftState.INITIATING:
            state_duration = sim_time - self._state_start_time

            if abs_angle < self.DRIFT_ANGLE_THRESHOLD * 0.7:
                # Failed initiation, back to straight
                self._transition_state(DriftState.STRAIGHT, sim_time)
            elif state_duration > 0.3 or abs_angle > self.DRIFT_ANGLE_THRESHOLD * 1.5:
                # Established drift
                self._transition_state(DriftState.DRIFTING, sim_time)

        elif self._state == DriftState.DRIFTING:
            # Check for direction change (transition)
            if (self._prev_drift_direction != 0 and
                self._drift_direction != 0 and
                self._prev_drift_direction != self._drift_direction):
                self._transition_state(DriftState.TRANSITIONING, sim_time)

            # Check for recovery
            elif abs_angle < self.DRIFT_ANGLE_THRESHOLD * 0.7:
                self._transition_state(DriftState.RECOVERING, sim_time)

        elif self._state == DriftState.TRANSITIONING:
            state_duration = sim_time - self._state_start_time

            if abs_angle > self.DRIFT_ANGLE_THRESHOLD:
                # New drift established
                self._transition_state(DriftState.DRIFTING, sim_time)
            elif state_duration > 1.0:
                # Transition took too long
                self._transition_state(DriftState.RECOVERING, sim_time)

        elif self._state == DriftState.RECOVERING:
            state_duration = sim_time - self._state_start_time

            if abs_angle > self.DRIFT_ANGLE_THRESHOLD:
                # Back into drift
                self._transition_state(DriftState.DRIFTING, sim_time)
            elif abs_angle < 5.0 and state_duration > 0.5:
                # Recovered
                self._transition_state(DriftState.STRAIGHT, sim_time)

        # Update previous values
        self._prev_drift_angle = drift_angle
        self._prev_drift_direction = self._drift_direction

        return DetectionState(
            drift_state=self._state,
            initiation=self._initiation,
            state_duration=sim_time - self._state_start_time,
            drift_angle=drift_angle,
            rear_slip_avg=rear_slip_avg,
            front_slip_avg=front_slip_avg
        )

    @property
    def state(self) -> DriftState:
        """Current drift state."""
        return self._state

    @property
    def initiation(self) -> DriftInitiation:
        """How current drift was initiated."""
        return self._initiation

    @property
    def is_drifting(self) -> bool:
        """Whether currently in a drift."""
        return self._state in (DriftState.DRIFTING, DriftState.TRANSITIONING)

    def reset(self) -> None:
        """Reset detector state."""
        self._state = DriftState.STRAIGHT
        self._initiation = DriftInitiation.NONE
        self._state_start_time = 0.0
        self._throttle_history.clear()
        self._steer_history.clear()
        self._angle_history.clear()
        self._prev_drift_angle = 0.0
        self._prev_drift_direction = 0
        self._drift_direction = 0
