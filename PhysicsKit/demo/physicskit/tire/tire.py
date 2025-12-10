"""Complete tire model combining Pacejka, slip calculations, and relaxation."""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Optional

from physicskit.core.vector import Vector3
from physicskit.tire.pacejka import PacejkaParams, PacejkaFormula
from physicskit.tire.slip import SlipCalculator, SlipState
from physicskit.tire.combined import CombinedSlip, CombinedForces
from physicskit.tire.relaxation import TireRelaxation


@dataclass
class TireState:
    """Complete state of a tire for telemetry/visualization."""
    # Slip quantities
    slip_ratio: float = 0.0
    slip_angle: float = 0.0        # radians
    slip_angle_deg: float = 0.0    # degrees

    # Forces (tire frame: X=forward, Y=right)
    Fx: float = 0.0                # Longitudinal force (N)
    Fy: float = 0.0                # Lateral force (N)
    Fz: float = 0.0                # Normal load (N)

    # Pure slip forces (before combined slip reduction)
    Fx_pure: float = 0.0
    Fy_pure: float = 0.0

    # Saturation (0-1, how close to friction limit)
    saturation: float = 0.0

    # Wheel rotation
    angular_velocity: float = 0.0  # rad/s
    rotation_angle: float = 0.0    # radians (for rendering)

    # Contact info
    contact_velocity: float = 0.0  # m/s at contact patch
    is_grounded: bool = True


@dataclass
class TireConfig:
    """Configuration for a tire."""
    # Physical dimensions
    radius: float = 0.32           # Wheel radius (m)
    width: float = 0.225           # Tire width (m)
    inertia: float = 1.0           # Rotational inertia (kg*m^2)

    # Tire model parameters
    pacejka_params: PacejkaParams = field(default_factory=PacejkaParams.sport_tire)

    # Relaxation
    relaxation_length_x: float = 0.4  # Longitudinal (m)
    relaxation_length_y: float = 0.5  # Lateral (m)
    use_relaxation: bool = True

    # Friction
    friction_mu: float = 1.0       # Overall friction multiplier

    @classmethod
    def sport(cls) -> TireConfig:
        """Sport/performance tire configuration."""
        return cls(
            radius=0.32,
            width=0.245,
            inertia=1.2,
            pacejka_params=PacejkaParams.sport_tire(),
            relaxation_length_x=0.3,
            relaxation_length_y=0.4,
            friction_mu=1.0
        )

    @classmethod
    def drift(cls) -> TireConfig:
        """Drift tire configuration (less grip, more progressive)."""
        return cls(
            radius=0.32,
            width=0.225,
            inertia=1.0,
            pacejka_params=PacejkaParams.drift_tire(),
            relaxation_length_x=0.35,
            relaxation_length_y=0.45,
            friction_mu=0.9
        )


class Tire:
    """Complete tire model for vehicle simulation.

    Combines:
    - Pacejka Magic Formula for force calculation
    - Slip ratio and angle calculations
    - Combined slip with friction ellipse
    - Relaxation length dynamics
    - Wheel rotation dynamics
    """

    def __init__(self, config: Optional[TireConfig] = None):
        """Initialize tire.

        Args:
            config: Tire configuration. Defaults to sport tire.
        """
        self.config = config or TireConfig.sport()

        # Sub-models
        self.pacejka = PacejkaFormula(self.config.pacejka_params)
        self.combined_slip = CombinedSlip(
            self.pacejka,
            friction_mu=self.config.friction_mu
        )
        self.relaxation = TireRelaxation(
            self.config.relaxation_length_x,
            self.config.relaxation_length_y
        )

        # State
        self.angular_velocity: float = 0.0  # rad/s
        self.rotation_angle: float = 0.0    # radians (cumulative)
        self.normal_load: float = 4000.0    # N
        self.camber: float = 0.0            # degrees

        # Cached slip state
        self._slip_state = SlipState()

        # Cached forces
        self._Fx: float = 0.0
        self._Fy: float = 0.0

    def update(
        self,
        contact_velocity: Vector3,
        wheel_heading: float,
        normal_load: float,
        drive_torque: float,
        brake_torque: float,
        dt: float
    ) -> TireState:
        """Update tire state and calculate forces.

        Args:
            contact_velocity: Velocity at contact patch (world frame, m/s)
            wheel_heading: Direction wheel is pointing (radians)
            normal_load: Vertical load on tire (N)
            drive_torque: Torque from drivetrain (N*m, positive = forward)
            brake_torque: Brake torque (N*m, always positive, resists rotation)
            dt: Time step (seconds)

        Returns:
            TireState with all tire information
        """
        self.normal_load = max(0.0, normal_load)

        # If no load, no forces
        if self.normal_load < 10.0:
            self._Fx = 0.0
            self._Fy = 0.0
            return self._get_state(contact_velocity)

        # Calculate slip quantities
        self._slip_state = SlipCalculator.calculate_slip(
            contact_velocity,
            wheel_heading,
            self.angular_velocity,
            self.config.radius
        )

        # Calculate steady-state forces using combined slip
        forces = self.combined_slip.calculate(
            self._slip_state.slip_ratio,
            self._slip_state.slip_angle_deg,
            self.normal_load,
            self.camber,
            method="empirical"
        )

        # Apply relaxation if enabled
        if self.config.use_relaxation:
            velocity_mag = contact_velocity.magnitude_2d()
            self._Fx, self._Fy = self.relaxation.update(
                forces.Fx, forces.Fy, velocity_mag, dt
            )
        else:
            self._Fx = forces.Fx
            self._Fy = forces.Fy

        # Update wheel angular velocity
        self._update_wheel_rotation(drive_torque, brake_torque, dt)

        # Update rotation angle for rendering
        self.rotation_angle += self.angular_velocity * dt

        return self._get_state(contact_velocity, forces)

    def _update_wheel_rotation(
        self,
        drive_torque: float,
        brake_torque: float,
        dt: float
    ) -> None:
        """Update wheel angular velocity from torques.

        Torque balance: I * d(omega)/dt = drive_torque - brake_torque - Fx * R
        """
        # Longitudinal force creates reaction torque on wheel
        reaction_torque = self._Fx * self.config.radius

        # Net torque on wheel
        net_torque = drive_torque - reaction_torque

        # Apply brake torque (always opposes rotation)
        if abs(self.angular_velocity) > 0.1:
            brake_dir = -math.copysign(1.0, self.angular_velocity)
            net_torque += brake_torque * brake_dir
        else:
            # At very low speeds, brake can stop wheel
            if abs(net_torque) < brake_torque:
                net_torque = 0.0
                self.angular_velocity = 0.0

        # Angular acceleration
        angular_accel = net_torque / self.config.inertia

        # Integrate
        self.angular_velocity += angular_accel * dt

        # Prevent wheel from spinning backwards when braking while stopped
        if brake_torque > 0 and abs(self.angular_velocity) < 0.1:
            self.angular_velocity = max(0.0, self.angular_velocity)

    def _get_state(
        self,
        contact_velocity: Vector3,
        forces: Optional[CombinedForces] = None
    ) -> TireState:
        """Build TireState from current state."""
        return TireState(
            slip_ratio=self._slip_state.slip_ratio,
            slip_angle=self._slip_state.slip_angle,
            slip_angle_deg=self._slip_state.slip_angle_deg,
            Fx=self._Fx,
            Fy=self._Fy,
            Fz=self.normal_load,
            Fx_pure=forces.Fx_pure if forces else self._Fx,
            Fy_pure=forces.Fy_pure if forces else self._Fy,
            saturation=forces.saturation if forces else 0.0,
            angular_velocity=self.angular_velocity,
            rotation_angle=self.rotation_angle,
            contact_velocity=contact_velocity.magnitude_2d(),
            is_grounded=self.normal_load > 10.0
        )

    def get_forces_world(self, wheel_heading: float) -> Vector3:
        """Get tire forces in world coordinates.

        Args:
            wheel_heading: Direction wheel is pointing (radians)

        Returns:
            Force vector in world frame
        """
        # Fx is along wheel heading, Fy is perpendicular (to the right)
        cos_h = math.cos(wheel_heading)
        sin_h = math.sin(wheel_heading)

        # Transform from tire frame to world
        world_x = self._Fx * cos_h - self._Fy * sin_h
        world_y = self._Fx * sin_h + self._Fy * cos_h

        return Vector3(world_x, world_y, 0.0)

    def get_forces_local(self) -> tuple[float, float]:
        """Get tire forces in tire frame.

        Returns:
            Tuple of (Fx, Fy) in tire coordinates
        """
        return self._Fx, self._Fy

    def reset(self) -> None:
        """Reset tire to initial state."""
        self.angular_velocity = 0.0
        self.rotation_angle = 0.0
        self.normal_load = 4000.0
        self._Fx = 0.0
        self._Fy = 0.0
        self._slip_state = SlipState()
        self.relaxation.reset()

    def set_angular_velocity_from_speed(self, speed: float) -> None:
        """Set wheel angular velocity to match a forward speed.

        Useful for initialization to avoid initial slip spike.
        """
        self.angular_velocity = speed / self.config.radius

    @property
    def state(self) -> TireState:
        """Get current tire state."""
        return self._get_state(Vector3())

    @property
    def slip_ratio(self) -> float:
        """Current slip ratio."""
        return self._slip_state.slip_ratio

    @property
    def slip_angle_deg(self) -> float:
        """Current slip angle in degrees."""
        return self._slip_state.slip_angle_deg
