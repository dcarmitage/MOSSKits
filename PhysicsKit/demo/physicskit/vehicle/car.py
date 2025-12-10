"""Complete vehicle model integrating all subsystems.

The Car class brings together:
- Rigid body physics (position, velocity, forces)
- Four tires with Pacejka model
- Suspension (weight transfer)
- Steering (Ackermann geometry)
- Drivetrain (RWD with differential)
- Handbrake

This creates a complete vehicle simulation suitable for drifting.
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Optional

from physicskit.core.vector import Vector3
from physicskit.core.rigid_body import RigidBody
from physicskit.tire.tire import Tire, TireConfig, TireState
from physicskit.tire.pacejka import PacejkaParams
from physicskit.vehicle.suspension import (
    Suspension, SuspensionConfig, WheelLoads, WheelPosition
)
from physicskit.vehicle.steering import Steering, SteeringConfig
from physicskit.vehicle.drivetrain import (
    Drivetrain, DrivetrainConfig, DifferentialType, DriveType
)
from physicskit.vehicle.handbrake import Handbrake, HandbrakeConfig


@dataclass
class CarConfig:
    """Complete vehicle configuration."""
    # Mass and inertia
    mass: float = 1400.0           # kg
    inertia: float = 2500.0        # kg*m^2 (yaw moment)

    # Dimensions
    wheelbase: float = 2.7         # Front to rear axle (m)
    track_front: float = 1.5       # Front wheel spacing (m)
    track_rear: float = 1.5        # Rear wheel spacing (m)
    cg_height: float = 0.5         # Center of gravity height (m)
    cg_to_front: float = 1.35      # CG to front axle (m)

    # Tire configuration
    tire_config: TireConfig = field(default_factory=TireConfig.sport)

    # Steering
    max_steer_angle: float = 0.6   # radians (~35 degrees)
    ackermann_factor: float = 0.8  # 0=parallel, 1=full Ackermann

    # Drivetrain
    drive_type: DriveType = DriveType.RWD
    differential: DifferentialType = DifferentialType.OPEN
    max_torque: float = 400.0      # Nm
    gear_ratio: float = 3.5

    # Brakes
    max_brake_torque: float = 3000.0
    brake_bias: float = 0.65
    handbrake_torque: float = 2000.0

    # LSD parameters (if using LSD diff)
    lsd_preload: float = 100.0
    lsd_power_ratio: float = 0.3
    lsd_coast_ratio: float = 0.1

    @classmethod
    def sport(cls) -> CarConfig:
        """Sport car configuration."""
        return cls(
            mass=1400.0,
            inertia=2500.0,
            wheelbase=2.7,
            track_front=1.5,
            track_rear=1.5,
            cg_height=0.45,
            cg_to_front=1.4,
            tire_config=TireConfig.sport(),
            max_steer_angle=0.6,
            ackermann_factor=0.8,
            drive_type=DriveType.RWD,
            differential=DifferentialType.OPEN,
            max_torque=400.0,
            gear_ratio=3.5
        )

    @classmethod
    def drift(cls) -> CarConfig:
        """Drift car configuration - tuned for controlled slides."""
        return cls(
            mass=1300.0,
            inertia=2200.0,
            wheelbase=2.7,
            track_front=1.55,
            track_rear=1.55,
            cg_height=0.4,
            cg_to_front=1.5,  # Slightly rear biased
            tire_config=TireConfig.drift(),
            max_steer_angle=0.7,  # More lock
            ackermann_factor=0.5,  # Less Ackermann for predictability
            drive_type=DriveType.RWD,
            differential=DifferentialType.LSD,
            max_torque=450.0,
            gear_ratio=3.8,
            lsd_preload=150.0,
            lsd_power_ratio=0.4,
            lsd_coast_ratio=0.15,
            handbrake_torque=2500.0
        )


@dataclass
class CarState:
    """Complete vehicle state for telemetry."""
    # Body state
    position: Vector3 = field(default_factory=Vector3)
    orientation: float = 0.0       # radians
    velocity: Vector3 = field(default_factory=Vector3)
    angular_velocity: float = 0.0  # rad/s

    # Derived quantities
    speed: float = 0.0             # m/s
    forward_speed: float = 0.0     # m/s (can be negative)
    lateral_speed: float = 0.0     # m/s

    # Accelerations
    longitudinal_accel: float = 0.0
    lateral_accel: float = 0.0

    # Wheel loads
    wheel_loads: WheelLoads = field(default_factory=WheelLoads)

    # Tire states
    tire_FL: TireState = field(default_factory=TireState)
    tire_FR: TireState = field(default_factory=TireState)
    tire_RL: TireState = field(default_factory=TireState)
    tire_RR: TireState = field(default_factory=TireState)

    # Inputs
    throttle: float = 0.0
    brake: float = 0.0
    steer: float = 0.0
    handbrake: float = 0.0


class Car:
    """Complete 4-wheel vehicle model for physics simulation.

    Integrates all subsystems into a coherent vehicle that can be
    driven with throttle, brake, steering, and handbrake inputs.
    """

    def __init__(self, config: Optional[CarConfig] = None):
        """Initialize vehicle.

        Args:
            config: Vehicle configuration. Defaults to sport car.
        """
        self.config = config or CarConfig.sport()

        # Create rigid body
        self.body = RigidBody(
            mass=self.config.mass,
            inertia=self.config.inertia
        )

        # Create subsystems
        self._init_suspension()
        self._init_steering()
        self._init_drivetrain()
        self._init_handbrake()
        self._init_tires()

        # Input state
        self._throttle: float = 0.0
        self._brake: float = 0.0
        self._steer: float = 0.0
        self._handbrake: float = 0.0

        # Cached state
        self._wheel_loads = WheelLoads()
        self._prev_velocity = Vector3()
        self._longitudinal_accel: float = 0.0
        self._lateral_accel: float = 0.0

    def _init_suspension(self) -> None:
        """Initialize suspension system."""
        self.suspension = Suspension(SuspensionConfig(
            wheelbase=self.config.wheelbase,
            track_front=self.config.track_front,
            track_rear=self.config.track_rear,
            cg_height=self.config.cg_height,
            cg_to_front=self.config.cg_to_front,
            total_mass=self.config.mass
        ))

    def _init_steering(self) -> None:
        """Initialize steering system."""
        self.steering = Steering(SteeringConfig(
            max_steer_angle=self.config.max_steer_angle,
            ackermann_factor=self.config.ackermann_factor,
            wheelbase=self.config.wheelbase,
            track_width=self.config.track_front
        ))

    def _init_drivetrain(self) -> None:
        """Initialize drivetrain."""
        self.drivetrain = Drivetrain(DrivetrainConfig(
            drive_type=self.config.drive_type,
            differential=self.config.differential,
            max_torque=self.config.max_torque,
            gear_ratio=self.config.gear_ratio,
            max_brake_torque=self.config.max_brake_torque,
            brake_bias=self.config.brake_bias,
            lsd_preload=self.config.lsd_preload,
            lsd_power_ratio=self.config.lsd_power_ratio,
            lsd_coast_ratio=self.config.lsd_coast_ratio
        ))

    def _init_handbrake(self) -> None:
        """Initialize handbrake."""
        self.handbrake = Handbrake(HandbrakeConfig(
            max_torque=self.config.handbrake_torque
        ))

    def _init_tires(self) -> None:
        """Initialize tires."""
        self.tires: Dict[WheelPosition, Tire] = {
            WheelPosition.FRONT_LEFT: Tire(self.config.tire_config),
            WheelPosition.FRONT_RIGHT: Tire(self.config.tire_config),
            WheelPosition.REAR_LEFT: Tire(self.config.tire_config),
            WheelPosition.REAR_RIGHT: Tire(self.config.tire_config),
        }

    def set_inputs(
        self,
        throttle: float = 0.0,
        brake: float = 0.0,
        steer: float = 0.0,
        handbrake: float = 0.0
    ) -> None:
        """Set control inputs.

        Args:
            throttle: Throttle position (0-1)
            brake: Brake pedal (0-1)
            steer: Steering (-1 left, +1 right)
            handbrake: Handbrake (0-1)
        """
        self._throttle = max(0.0, min(1.0, throttle))
        self._brake = max(0.0, min(1.0, brake))
        self._steer = max(-1.0, min(1.0, steer))
        self._handbrake = max(0.0, min(1.0, handbrake))

    def get_wheel_position_local(self, wheel: WheelPosition) -> Vector3:
        """Get wheel position in local (body) coordinates."""
        cfg = self.config

        if wheel == WheelPosition.FRONT_LEFT:
            return Vector3(cfg.cg_to_front, cfg.track_front / 2, 0)
        elif wheel == WheelPosition.FRONT_RIGHT:
            return Vector3(cfg.cg_to_front, -cfg.track_front / 2, 0)
        elif wheel == WheelPosition.REAR_LEFT:
            return Vector3(-(cfg.wheelbase - cfg.cg_to_front), cfg.track_rear / 2, 0)
        else:  # REAR_RIGHT
            return Vector3(-(cfg.wheelbase - cfg.cg_to_front), -cfg.track_rear / 2, 0)

    def get_wheel_position_world(self, wheel: WheelPosition) -> Vector3:
        """Get wheel position in world coordinates."""
        local = self.get_wheel_position_local(wheel)
        return self.body.local_to_world(local)

    def physics_step(self, dt: float) -> None:
        """Perform one physics simulation step.

        This is the main simulation loop that:
        1. Updates subsystems (steering, handbrake)
        2. Calculates wheel loads
        3. Calculates tire forces
        4. Applies forces to body
        5. Integrates body state

        Args:
            dt: Time step in seconds
        """
        # Update subsystems
        self.steering.set_input(self._steer)
        self.steering.update(dt)
        self.handbrake.set_input(self._handbrake)
        self.handbrake.update(dt)

        # Calculate accelerations for weight transfer
        self._update_accelerations(dt)

        # Get wheel loads
        self._wheel_loads = self.suspension.calculate_loads_simple(
            self._longitudinal_accel,
            self._lateral_accel
        )

        # Get steering angles
        steer_left, steer_right = self.steering.get_wheel_angles()

        # Get drive and brake torques
        rear_wheel_speeds = (
            self.tires[WheelPosition.REAR_LEFT].angular_velocity,
            self.tires[WheelPosition.REAR_RIGHT].angular_velocity
        )
        drive_torque_L, drive_torque_R = self.drivetrain.get_drive_torques(
            self._throttle, rear_wheel_speeds
        )
        brake_FL, brake_FR, brake_RL, brake_RR = self.drivetrain.get_brake_torques(
            self._brake
        )

        # Handbrake torques (rear only)
        hb_L, hb_R = self.handbrake.get_brake_torques(rear_wheel_speeds)

        # Process each tire
        total_force = Vector3()
        total_torque = 0.0

        for wheel in WheelPosition:
            tire = self.tires[wheel]
            local_pos = self.get_wheel_position_local(wheel)
            world_pos = self.body.local_to_world(local_pos)

            # Get velocity at wheel
            contact_velocity = self.body.get_velocity_at_point(world_pos)

            # Wheel heading (body heading + steering for front wheels)
            if wheel in (WheelPosition.FRONT_LEFT, WheelPosition.FRONT_RIGHT):
                if wheel == WheelPosition.FRONT_LEFT:
                    wheel_heading = self.body.orientation + steer_left
                else:
                    wheel_heading = self.body.orientation + steer_right
            else:
                wheel_heading = self.body.orientation

            # Get normal load
            normal_load = self._wheel_loads.get(wheel)

            # Get drive and brake torques for this wheel
            if wheel == WheelPosition.REAR_LEFT:
                drive_torque = drive_torque_L
                brake_torque = brake_RL + hb_L
            elif wheel == WheelPosition.REAR_RIGHT:
                drive_torque = drive_torque_R
                brake_torque = brake_RR + hb_R
            elif wheel == WheelPosition.FRONT_LEFT:
                drive_torque = 0.0  # RWD
                brake_torque = brake_FL
            else:  # FRONT_RIGHT
                drive_torque = 0.0
                brake_torque = brake_FR

            # Update tire and get forces
            tire_state = tire.update(
                contact_velocity,
                wheel_heading,
                normal_load,
                drive_torque,
                brake_torque,
                dt
            )

            # Get tire forces in world frame
            tire_force_world = tire.get_forces_world(wheel_heading)

            # Accumulate forces
            total_force += tire_force_world

            # Calculate torque from this tire
            # Torque = r x F (in 2D, this is the z-component)
            r = world_pos - self.body.position
            tire_torque = r.x * tire_force_world.y - r.y * tire_force_world.x
            total_torque += tire_torque

        # Apply forces to body
        self.body.apply_force(total_force)
        self.body.apply_torque(total_torque)

        # Add air resistance (simplified)
        speed = self.body.velocity.magnitude()
        if speed > 0.1:
            drag_coefficient = 0.3
            frontal_area = 2.2
            air_density = 1.225
            drag_force = 0.5 * drag_coefficient * frontal_area * air_density * speed * speed
            drag_direction = self.body.velocity.normalized() * (-1)
            self.body.apply_force(drag_direction * drag_force)

        # Integrate
        self.body.integrate(dt)

        # Update engine RPM
        avg_rear_speed = (
            self.tires[WheelPosition.REAR_LEFT].angular_velocity +
            self.tires[WheelPosition.REAR_RIGHT].angular_velocity
        ) / 2
        self.drivetrain.update_engine_rpm(avg_rear_speed, dt)

    def _update_accelerations(self, dt: float) -> None:
        """Calculate accelerations for weight transfer."""
        if dt <= 0:
            return

        # Calculate acceleration from velocity change
        dv = self.body.velocity - self._prev_velocity
        world_accel = dv / dt

        # Transform to local frame
        local_accel = self.body.world_to_local_direction(world_accel)

        # Smooth the acceleration values
        alpha = min(1.0, dt * 10)  # ~0.1s time constant
        self._longitudinal_accel += (local_accel.x - self._longitudinal_accel) * alpha
        self._lateral_accel += (local_accel.y - self._lateral_accel) * alpha

        self._prev_velocity = self.body.velocity.copy()

    def get_state(self) -> CarState:
        """Get complete vehicle state."""
        local_vel = self.body.get_local_velocity()

        return CarState(
            position=self.body.position.copy(),
            orientation=self.body.orientation,
            velocity=self.body.velocity.copy(),
            angular_velocity=self.body.angular_velocity,
            speed=self.body.get_speed(),
            forward_speed=local_vel.x,
            lateral_speed=local_vel.y,
            longitudinal_accel=self._longitudinal_accel,
            lateral_accel=self._lateral_accel,
            wheel_loads=self._wheel_loads,
            tire_FL=self.tires[WheelPosition.FRONT_LEFT].state,
            tire_FR=self.tires[WheelPosition.FRONT_RIGHT].state,
            tire_RL=self.tires[WheelPosition.REAR_LEFT].state,
            tire_RR=self.tires[WheelPosition.REAR_RIGHT].state,
            throttle=self._throttle,
            brake=self._brake,
            steer=self._steer,
            handbrake=self._handbrake
        )

    def get_drift_angle(self) -> float:
        """Get current drift angle (body slip angle) in degrees."""
        local_vel = self.body.get_local_velocity()
        if abs(local_vel.x) < 0.5:
            return 0.0
        return math.degrees(math.atan2(local_vel.y, local_vel.x))

    def reset(self, position: Vector3 = None, orientation: float = 0.0) -> None:
        """Reset vehicle to initial state.

        Args:
            position: Starting position. Defaults to origin.
            orientation: Starting orientation in radians.
        """
        self.body.reset()
        if position:
            self.body.position = position.copy()
        self.body.orientation = orientation

        for tire in self.tires.values():
            tire.reset()

        self.handbrake.reset()

        self._throttle = 0.0
        self._brake = 0.0
        self._steer = 0.0
        self._handbrake = 0.0

        self._prev_velocity = Vector3()
        self._longitudinal_accel = 0.0
        self._lateral_accel = 0.0
        self._wheel_loads = self.suspension.get_static_loads()

    def set_velocity(self, speed: float, direction: float = None) -> None:
        """Set vehicle velocity.

        Useful for starting simulations at speed.

        Args:
            speed: Speed in m/s
            direction: Direction in radians. Defaults to current orientation.
        """
        if direction is None:
            direction = self.body.orientation

        self.body.velocity = Vector3(
            speed * math.cos(direction),
            speed * math.sin(direction),
            0.0
        )

        # Match wheel speeds to avoid initial slip
        for tire in self.tires.values():
            tire.set_angular_velocity_from_speed(speed)
