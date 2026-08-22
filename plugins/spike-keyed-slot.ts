/**
 * W13 spike: the keyed-slot shadowing test.
 *
 * This client plugin answers one question. Can a client plugin claim a keyed
 * slot key that a shipped plugin already owns, and win? The spike registers a
 * loud banner under the key `assistant-step` of the keyed slot
 * `conversation.chat.node`.
 *
 * Mechanism (all file:line evidence is in the report for W13 step 1):
 * - The slot core sorts entries by priority, lowest first
 *   (@deepseek-ai/dsh-client-ui-slots lib/index.js:122), then projects the
 *   first live entry of each keyed cell as the shadowing winner
 *   (lib/index.js:165-202, "shadowing winners ... in priority order").
 * - A second registration on the same key throws ONLY when the priority is
 *   also equal (lib/index.js:78-80). The hint says it plainly: register at
 *   a different priority to shadow it, lowest renders.
 * - The runtime service passes priority through untouched
 *   (dsh-client-runtime lib/client.js:243-258), so this plugin picks its
 *   own priority.
 * - The shipped owner of key `assistant-step` is AssistantNodeView at the
 *   default priority 0 (dsh-client-ui-conversation lib/client.js:9681-9685).
 * - The installed dsh-better-markdown plugin already claims this exact key
 *   at priority -100 and wins in the live profile
 *   (dsh-better-markdown lib/client.js tail, line 4416).
 *
 * The spike registers at priority -1000, lower than both the shipped entry
 * (0) and the markdown plugin (-100). The lowest priority renders, so the
 * spike banner must win.
 *
 * This file is a CLIENT plugin. It runs in the browser, not on the host.
 * The client module loader loads it as a factory and hands the factory a
 * resolver for shared browser modules. React is a shared module. The plugin
 * object shape is { apply, inject }, the same shape the installed
 * dsh-better-markdown client uses.
 */
declare const window: {
	__ModuleLoader__?: {
		load: (entry: {
			id: string;
			factory: (resolve: (id: string) => any) => any;
		}) => void;
	};
};

const loader = window.__ModuleLoader__;

// The loader exists when client chunks evaluate. Guard for a hostile boot.
if (loader) {
	loader.load({
		id: "spike-keyed-slot",
		factory: function spikeFactory(resolve) {
			const react = resolve("react");
			const createElement = react.createElement || react.default.createElement;

			// The banner replaces the shipped assistant-step node in the chat.
			// Its look is unmistakable: a red bar with a dashed black border.
			const SpikeBanner = () =>
				createElement(
					"div",
					{
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							minHeight: 120,
							margin: 8,
							padding: 16,
							borderRadius: 8,
							background: "#ff0044",
							color: "#ffffff",
							fontSize: 28,
							fontWeight: 800,
							border: "6px dashed #000000",
							textAlign: "center",
						},
					},
					"SPIKE-SHADOW-WIN"
				);

			// The apply function runs when the plugin boots. The slots service
			// is the only service this plugin needs.
			const apply = (ctx: any) => {
				// inject() waits for the slot declaration, then runs register().
				// register() throws only when the same key exists at the same
				// priority. Priority -1000 wins every cell occupancy here.
				ctx.slots.inject("conversation.chat.node", () =>
					ctx.slots.register(
						{
							name: "conversation.chat.node",
							key: "assistant-step",
							priority: -1000,
							locale: "conversation",
						},
						SpikeBanner
					)
				);
			};

			return {
				apply,
				inject: ["slots"],
			};
		},
	});
}