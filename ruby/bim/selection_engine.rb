module RelatorioPRO
	module Bim
		module SelectionEngine
			module_function

			def select_entities(model, pids, clear: true, trace: nil)
				selection = model.selection
				selection.clear if clear

				found = Resolver.find_entities_by_persistent_ids(model, pids)
				found.each { |entity| selection.add(entity) }

				trace&.call("select_entities", {
					requested: Array(pids).length,
					resolved: found.length,
					clear: !!clear
				})

				found
			end

			def select_tag_entities(model:, tag_name:, focus: false, isolate: false, trace: nil, on_focus: nil, on_isolate: nil, on_restore: nil)
				return { success: false, count: 0, error: "no_model" } unless model

				tag_label = tag_name.to_s.strip
				return { success: false, count: 0, error: "empty_tag" } if tag_label.empty?

				layer = Resolver.find_layer_by_name(model, tag_label)
				if layer && model.respond_to?(:active_layer=)
					model.active_layer = layer
				end

				entities = Resolver.collect_entities_by_tag(model, tag_label)
				trace&.call("select_tag_entities_resolved", { tag: tag_label, resolved: entities.length })

				selection = model.selection
				selection.clear
				entities.each { |entity| selection.add(entity) }

				if isolate
					on_isolate&.call(layer, entities)
				else
					on_restore&.call
				end

				if focus && !entities.empty?
					on_focus&.call(entities)
				end

				trace&.call("select_tag_entities", {
					tag: tag_label,
					count: entities.length,
					focus: !!focus,
					isolate: !!isolate
				})

				{ success: true, count: entities.length, tag: tag_label }
			rescue StandardError => e
				puts("[RelatorioPRO] select_tag_entities error: #{e.class}: #{e.message}")
				{ success: false, count: 0, error: e.message }
			end
		end
	end
end