"""Pygame-based real-time 2D renderer for vehicle simulation.

Provides a top-down view of the vehicle with:
- Vehicle body and wheels
- Tire force vectors
- Trajectory trail
- Telemetry overlay
- Keyboard input handling
"""

from __future__ import annotations
import math
from dataclasses import dataclass
from typing import TYPE_CHECKING, List, Dict, Tuple, Optional

try:
    import pygame
    PYGAME_AVAILABLE = True
except ImportError:
    PYGAME_AVAILABLE = False

from physicskit.core.vector import Vector3

if TYPE_CHECKING:
    from physicskit.vehicle.car import Car, CarState
    from physicskit.drift.metrics import DriftMetrics


@dataclass
class RenderConfig:
    """Renderer configuration."""
    width: int = 1280
    height: int = 720
    scale: float = 15.0             # Pixels per meter
    background_color: Tuple[int, int, int] = (30, 30, 35)
    car_color: Tuple[int, int, int] = (200, 200, 210)
    wheel_color: Tuple[int, int, int] = (60, 60, 65)
    force_color_fx: Tuple[int, int, int] = (100, 200, 100)
    force_color_fy: Tuple[int, int, int] = (200, 100, 100)
    trail_color: Tuple[int, int, int] = (100, 100, 150)
    text_color: Tuple[int, int, int] = (220, 220, 220)

    camera_follow: bool = True
    show_forces: bool = True
    show_telemetry: bool = True
    show_trail: bool = True
    trail_length: int = 500

    force_scale: float = 0.001     # Scale factor for force vectors


class PygameRenderer:
    """Real-time 2D renderer using Pygame.

    Renders a top-down view of the vehicle simulation with
    telemetry overlay and keyboard input handling.
    """

    def __init__(self, config: Optional[RenderConfig] = None):
        """Initialize renderer.

        Args:
            config: Render configuration. Uses defaults if None.
        """
        if not PYGAME_AVAILABLE:
            raise ImportError(
                "Pygame is required for visualization. "
                "Install it with: pip install pygame"
            )

        self.config = config or RenderConfig()
        self._initialized = False

        # Pygame surfaces
        self._screen = None
        self._clock = None
        self._font = None
        self._small_font = None

        # Camera state
        self._camera_x: float = 0.0
        self._camera_y: float = 0.0

        # Trail
        self._trail: List[Tuple[float, float]] = []

        # Input state
        self._keys = {
            'throttle': 0.0,
            'brake': 0.0,
            'steer': 0.0,
            'handbrake': 0.0,
            'quit': False,
            'reset': False
        }

    def init(self) -> None:
        """Initialize Pygame and create window."""
        pygame.init()
        pygame.display.set_caption("PhysicsKit - Drift Simulator")

        self._screen = pygame.display.set_mode(
            (self.config.width, self.config.height)
        )
        self._clock = pygame.time.Clock()
        self._font = pygame.font.Font(None, 24)
        self._small_font = pygame.font.Font(None, 18)

        self._initialized = True

    def quit(self) -> None:
        """Clean up Pygame."""
        if self._initialized:
            pygame.quit()
            self._initialized = False

    def handle_input(self) -> Dict[str, float]:
        """Process input events and return control values.

        Returns:
            Dictionary with 'throttle', 'brake', 'steer', 'handbrake',
            'quit', and 'reset' keys.
        """
        if not self._initialized:
            return self._keys

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self._keys['quit'] = True
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    self._keys['quit'] = True
                elif event.key == pygame.K_r:
                    self._keys['reset'] = True
                elif event.key == pygame.K_f:
                    self.config.show_forces = not self.config.show_forces
                elif event.key == pygame.K_t:
                    self.config.show_telemetry = not self.config.show_telemetry
                elif event.key == pygame.K_c:
                    self.config.camera_follow = not self.config.camera_follow
            elif event.type == pygame.KEYUP:
                if event.key == pygame.K_r:
                    self._keys['reset'] = False

        # Get keyboard state for controls
        keys = pygame.key.get_pressed()

        # Throttle: W or Up
        self._keys['throttle'] = 1.0 if (keys[pygame.K_w] or keys[pygame.K_UP]) else 0.0

        # Brake: S or Down
        self._keys['brake'] = 1.0 if (keys[pygame.K_s] or keys[pygame.K_DOWN]) else 0.0

        # Steering: A/D or Left/Right
        steer = 0.0
        if keys[pygame.K_a] or keys[pygame.K_LEFT]:
            steer -= 1.0
        if keys[pygame.K_d] or keys[pygame.K_RIGHT]:
            steer += 1.0
        self._keys['steer'] = steer

        # Handbrake: Space
        self._keys['handbrake'] = 1.0 if keys[pygame.K_SPACE] else 0.0

        return self._keys.copy()

    def _world_to_screen(self, x: float, y: float) -> Tuple[int, int]:
        """Convert world coordinates to screen coordinates."""
        screen_x = int((x - self._camera_x) * self.config.scale + self.config.width / 2)
        screen_y = int(self.config.height / 2 - (y - self._camera_y) * self.config.scale)
        return screen_x, screen_y

    def _draw_car(self, car: Car) -> None:
        """Draw the vehicle body and wheels."""
        state = car.get_state()
        cfg = car.config

        # Car body dimensions (approximate)
        length = cfg.wheelbase * 1.2
        width = cfg.track_front * 0.8

        # Get corners in local space
        half_l = length / 2
        half_w = width / 2
        corners_local = [
            Vector3(half_l, half_w, 0),
            Vector3(half_l, -half_w, 0),
            Vector3(-half_l, -half_w, 0),
            Vector3(-half_l, half_w, 0),
        ]

        # Transform to world and then screen
        corners_screen = []
        for corner in corners_local:
            world = car.body.local_to_world(corner)
            corners_screen.append(self._world_to_screen(world.x, world.y))

        # Draw body
        pygame.draw.polygon(self._screen, self.config.car_color, corners_screen)
        pygame.draw.polygon(self._screen, (100, 100, 110), corners_screen, 2)

        # Draw wheels
        wheel_length = 0.6
        wheel_width = 0.25
        steer_L, steer_R = car.steering.get_wheel_angles()

        from physicskit.vehicle.suspension import WheelPosition
        wheel_steers = {
            WheelPosition.FRONT_LEFT: steer_L,
            WheelPosition.FRONT_RIGHT: steer_R,
            WheelPosition.REAR_LEFT: 0,
            WheelPosition.REAR_RIGHT: 0,
        }

        for wheel_pos in WheelPosition:
            wheel_center_world = car.get_wheel_position_world(wheel_pos)
            wheel_heading = state.orientation + wheel_steers[wheel_pos]

            # Wheel corners
            cos_h = math.cos(wheel_heading)
            sin_h = math.sin(wheel_heading)

            wheel_corners = []
            for dx, dy in [(-wheel_length/2, wheel_width/2),
                          (wheel_length/2, wheel_width/2),
                          (wheel_length/2, -wheel_width/2),
                          (-wheel_length/2, -wheel_width/2)]:
                wx = wheel_center_world.x + dx * cos_h - dy * sin_h
                wy = wheel_center_world.y + dx * sin_h + dy * cos_h
                wheel_corners.append(self._world_to_screen(wx, wy))

            pygame.draw.polygon(self._screen, self.config.wheel_color, wheel_corners)

    def _draw_forces(self, car: Car) -> None:
        """Draw tire force vectors."""
        if not self.config.show_forces:
            return

        from physicskit.vehicle.suspension import WheelPosition
        state = car.get_state()
        steer_L, steer_R = car.steering.get_wheel_angles()

        tire_states = {
            WheelPosition.FRONT_LEFT: (state.tire_FL, steer_L),
            WheelPosition.FRONT_RIGHT: (state.tire_FR, steer_R),
            WheelPosition.REAR_LEFT: (state.tire_RL, 0),
            WheelPosition.REAR_RIGHT: (state.tire_RR, 0),
        }

        for wheel_pos in WheelPosition:
            tire_state, steer_angle = tire_states[wheel_pos]
            wheel_center_world = car.get_wheel_position_world(wheel_pos)
            wheel_heading = state.orientation + steer_angle

            # Scale forces for display
            scale = self.config.force_scale

            # Longitudinal force (green)
            fx_world = tire_state.Fx * math.cos(wheel_heading)
            fy_world = tire_state.Fx * math.sin(wheel_heading)

            start = self._world_to_screen(wheel_center_world.x, wheel_center_world.y)
            end = self._world_to_screen(
                wheel_center_world.x + fx_world * scale,
                wheel_center_world.y + fy_world * scale
            )
            if abs(tire_state.Fx) > 10:
                pygame.draw.line(self._screen, self.config.force_color_fx, start, end, 2)

            # Lateral force (red)
            fx_world = -tire_state.Fy * math.sin(wheel_heading)
            fy_world = tire_state.Fy * math.cos(wheel_heading)

            end = self._world_to_screen(
                wheel_center_world.x + fx_world * scale,
                wheel_center_world.y + fy_world * scale
            )
            if abs(tire_state.Fy) > 10:
                pygame.draw.line(self._screen, self.config.force_color_fy, start, end, 2)

    def _draw_trail(self, car: Car) -> None:
        """Draw vehicle trajectory trail."""
        if not self.config.show_trail:
            return

        # Add current position
        pos = car.body.position
        self._trail.append((pos.x, pos.y))

        # Limit trail length
        if len(self._trail) > self.config.trail_length:
            self._trail.pop(0)

        # Draw trail
        if len(self._trail) > 1:
            points = [self._world_to_screen(x, y) for x, y in self._trail]
            pygame.draw.lines(self._screen, self.config.trail_color, False, points, 1)

    def _draw_telemetry(self, car: Car, drift_metrics: Optional[DriftMetrics] = None) -> None:
        """Draw telemetry overlay."""
        if not self.config.show_telemetry:
            return

        state = car.get_state()

        lines = [
            f"Speed: {state.speed * 3.6:.1f} km/h",
            f"Drift Angle: {car.get_drift_angle():.1f}°",
            f"Throttle: {state.throttle * 100:.0f}%",
            f"Brake: {state.brake * 100:.0f}%",
            f"Steer: {state.steer * 100:.0f}%",
            f"Handbrake: {state.handbrake * 100:.0f}%",
            "",
            f"Long Accel: {state.longitudinal_accel:.1f} m/s²",
            f"Lat Accel: {state.lateral_accel:.1f} m/s²",
            f"Yaw Rate: {math.degrees(state.angular_velocity):.1f}°/s",
        ]

        if drift_metrics:
            lines.extend([
                "",
                f"Drift Score: {drift_metrics.overall_score:.0f}",
                f"Duration: {drift_metrics.drift_duration:.1f}s",
            ])

        y = 10
        for line in lines:
            if line:
                text = self._font.render(line, True, self.config.text_color)
                self._screen.blit(text, (10, y))
            y += 22

        # Controls help
        help_lines = [
            "Controls:",
            "W/↑ - Throttle",
            "S/↓ - Brake",
            "A/←, D/→ - Steer",
            "Space - Handbrake",
            "R - Reset",
            "F - Toggle forces",
            "T - Toggle telemetry",
            "C - Toggle camera",
            "Esc - Quit"
        ]

        y = 10
        for line in help_lines:
            text = self._small_font.render(line, True, (150, 150, 160))
            self._screen.blit(text, (self.config.width - 150, y))
            y += 18

    def render(
        self,
        car: Car,
        drift_metrics: Optional[DriftMetrics] = None,
        fps: int = 60
    ) -> None:
        """Render current frame.

        Args:
            car: Vehicle to render
            drift_metrics: Optional drift metrics for display
            fps: Target frame rate
        """
        if not self._initialized:
            self.init()

        # Update camera
        if self.config.camera_follow:
            self._camera_x = car.body.position.x
            self._camera_y = car.body.position.y

        # Clear screen
        self._screen.fill(self.config.background_color)

        # Draw grid
        self._draw_grid()

        # Draw trail
        self._draw_trail(car)

        # Draw car
        self._draw_car(car)

        # Draw forces
        self._draw_forces(car)

        # Draw telemetry
        self._draw_telemetry(car, drift_metrics)

        # Update display
        pygame.display.flip()

        # Limit frame rate
        self._clock.tick(fps)

    def _draw_grid(self) -> None:
        """Draw reference grid."""
        grid_spacing = 10.0  # meters
        grid_color = (40, 40, 45)

        # Calculate visible range
        left = self._camera_x - self.config.width / (2 * self.config.scale)
        right = self._camera_x + self.config.width / (2 * self.config.scale)
        bottom = self._camera_y - self.config.height / (2 * self.config.scale)
        top = self._camera_y + self.config.height / (2 * self.config.scale)

        # Vertical lines
        x = math.floor(left / grid_spacing) * grid_spacing
        while x <= right:
            screen_x = int((x - self._camera_x) * self.config.scale + self.config.width / 2)
            pygame.draw.line(self._screen, grid_color, (screen_x, 0), (screen_x, self.config.height))
            x += grid_spacing

        # Horizontal lines
        y = math.floor(bottom / grid_spacing) * grid_spacing
        while y <= top:
            screen_y = int(self.config.height / 2 - (y - self._camera_y) * self.config.scale)
            pygame.draw.line(self._screen, grid_color, (0, screen_y), (self.config.width, screen_y))
            y += grid_spacing

    def clear_trail(self) -> None:
        """Clear the trajectory trail."""
        self._trail.clear()

    def get_fps(self) -> float:
        """Get current FPS."""
        return self._clock.get_fps() if self._clock else 0.0
