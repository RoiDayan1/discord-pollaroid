/**
 * Helpers for extracting data from modal submit interactions.
 *
 * Discord's new modal components (Label, CheckboxGroup, RadioGroup) are not
 * fully typed in discord.js yet.  The raw `interaction.components` array
 * contains Label wrappers whose inner component holds the submitted values.
 */

import { ComponentType, type ModalSubmitInteraction } from 'discord.js';
import type {
  APIModalSubmitRadioGroupComponent,
  APIModalSubmitCheckboxGroupComponent,
  APIModalSubmissionComponent,
} from 'discord-api-types/v10';

type ModalComponent = APIModalSubmitRadioGroupComponent | APIModalSubmitCheckboxGroupComponent;

/**
 * Returns the raw top-level modal components from a submit interaction.
 * Needed because discord.js doesn't expose the Label wrapper in its types.
 */
export function getRawModalComponents(
  interaction: ModalSubmitInteraction,
): APIModalSubmissionComponent[] {
  return (interaction as unknown as { components: APIModalSubmissionComponent[] }).components;
}

/**
 * Finds a component inside a modal submission by its `customId`.
 * Handles the Label wrapper that Discord uses for new component types.
 */
export function findModalComponent(
  components: APIModalSubmissionComponent[],
  customId: string,
): ModalComponent | undefined {
  for (const comp of components) {
    if (comp.type === ComponentType.Label) {
      const inner = comp.component;
      if ('customId' in inner && inner.customId === customId) {
        return inner as ModalComponent;
      }
    }
  }
  return undefined;
}

/**
 * Extracts the selected values from a CheckboxGroup component.
 * Returns an empty array if the component is missing or has no selections.
 */
export function getCheckboxValues(
  components: APIModalSubmissionComponent[],
  customId: string,
): string[] {
  const comp = findModalComponent(components, customId) as { values?: string[] } | undefined;
  return comp?.values ?? [];
}

/**
 * Extracts selected role IDs from a RoleSelect component in modal submission data.
 * Returns an empty array if the component is missing or has no selections.
 */
export function getRoleSelectValues(
  components: APIModalSubmissionComponent[],
  customId: string,
): string[] {
  const comp = findModalComponent(components, customId) as { values?: string[] } | undefined;
  return comp?.values ?? [];
}

/**
 * Extracts the selected value from a RadioGroup component.
 * Returns null if the component is missing or nothing is selected.
 */
export function getRadioValue(
  components: APIModalSubmissionComponent[],
  customId: string,
): string | null {
  const comp = findModalComponent(components, customId) as { value?: string | null } | undefined;
  return comp?.value ?? null;
}
