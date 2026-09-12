// SplitKit form affordance: one numeric amount field per person on a
// FormController, with string signals for widget binding. T3.
import { bindFormField, FormController, Signal } from "exotui";

// Build an amount form. Each person gets one numeric field that starts at
// initialShare. A field rejects negative or non-numeric values. The whole
// form rejects sums that miss the total by more than half a paisa.
export function amountForm(
  people: string[],
  total: number,
  initialShare: number,
): { form: FormController<Record<string, number>>; inputs: Record<string, Signal<string>> } {
  const inputs: Record<string, Signal<string>> = {};
  for (const name of people) inputs[name] = new Signal(String(initialShare));
  const form = new FormController<Record<string, number>>({
    schema: {
      fields: people.map((name) => ({
        name,
        label: name,
        initialValue: initialShare,
        validators: [
          (value: unknown) => {
            const num = Number(value);
            return Number.isFinite(num) && num >= 0
              ? undefined
              : `${name} needs a number 0 or above`;
          },
        ],
      })),
      validate: (values) => {
        const sum = people.reduce((acc, name) => acc + Number(values[name]), 0);
        // Half a paisa of slack absorbs float drift.
        return Math.abs(sum - total) > 0.005
          ? { [people[0]!]: `amounts must add to ${total}` }
          : {};
      },
    },
  });
  for (const name of people) {
    bindFormField(form, name, inputs[name]!, {
      parse: (value) => Number(value),
      format: (value) => String(value),
      initialSync: "target",
      validateOnBind: true,
    });
  }
  return { form, inputs };
}
