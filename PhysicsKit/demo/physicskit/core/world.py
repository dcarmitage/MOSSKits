"""Simulation world managing physics updates."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

from physicskit.core.integrators import IntegratorType, semi_implicit_euler

if TYPE_CHECKING:
    from physicskit.vehicle.car import Car


@dataclass
class World:
    """Physics simulation world.

    Manages time stepping and provides fixed timestep simulation
    with accumulator for consistent physics regardless of frame rate.
    """

    # Simulation parameters
    dt: float = 0.001  # 1ms timestep for stability
    time: float = 0.0
    gravity: float = 9.81  # m/s^2
    integrator: IntegratorType = IntegratorType.SEMI_IMPLICIT_EULER

    # Managed objects
    vehicles: list = field(default_factory=list)

    # Fixed timestep accumulator
    _accumulator: float = 0.0
    _max_steps_per_frame: int = 20  # Prevent spiral of death

    def add_vehicle(self, vehicle: Car) -> None:
        """Add a vehicle to the simulation."""
        self.vehicles.append(vehicle)

    def remove_vehicle(self, vehicle: Car) -> None:
        """Remove a vehicle from the simulation."""
        if vehicle in self.vehicles:
            self.vehicles.remove(vehicle)

    def step(self) -> None:
        """Advance simulation by one fixed timestep (dt)."""
        # Update all vehicles
        for vehicle in self.vehicles:
            vehicle.physics_step(self.dt)

        self.time += self.dt

    def step_fixed(self, real_dt: float) -> int:
        """Fixed timestep update with accumulator.

        Call this once per frame with the real elapsed time.
        The simulation will step multiple times at fixed dt to
        catch up, ensuring consistent physics.

        Args:
            real_dt: Real elapsed time since last call (seconds)

        Returns:
            Number of physics steps taken
        """
        self._accumulator += real_dt
        steps = 0

        while self._accumulator >= self.dt and steps < self._max_steps_per_frame:
            self.step()
            self._accumulator -= self.dt
            steps += 1

        return steps

    def update(self, real_dt: float, inputs: Optional[dict] = None) -> int:
        """Convenience method to update simulation with inputs.

        Args:
            real_dt: Real elapsed time since last call
            inputs: Optional dict with 'throttle', 'brake', 'steer', 'handbrake'

        Returns:
            Number of physics steps taken
        """
        if inputs is not None:
            for vehicle in self.vehicles:
                vehicle.set_inputs(
                    throttle=inputs.get('throttle', 0.0),
                    brake=inputs.get('brake', 0.0),
                    steer=inputs.get('steer', 0.0),
                    handbrake=inputs.get('handbrake', 0.0)
                )

        return self.step_fixed(real_dt)

    def reset(self) -> None:
        """Reset simulation to initial state."""
        self.time = 0.0
        self._accumulator = 0.0
        for vehicle in self.vehicles:
            vehicle.reset()

    def get_interpolation_alpha(self) -> float:
        """Get interpolation factor for rendering between physics steps.

        Returns value in [0, 1] representing progress toward next step.
        Use for smooth rendering at higher frame rates than physics.
        """
        return self._accumulator / self.dt if self.dt > 0 else 0.0
