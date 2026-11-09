/**
 * ADMIN'S PARTS OF THE BACK OFFICE'S MENU (src/core/navigation.ts, provideNav): the core names no module, so each module
 * hands the menu its own gates and counts. Loaded last by the front door, as it reaches the module's own files.
 */
import { provideNav } from '../../core/index.ts';
import { adminSettingsGate, SETTINGS_TILES } from './admin-tiles.ts';

provideNav({ gates: { settings: adminSettingsGate }, settingsTiles: () => SETTINGS_TILES });
