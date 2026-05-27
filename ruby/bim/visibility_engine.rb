module RelatorioPRO
	module Bim
		module VisibilityEngine
			module_function

			def apply_tag_isolation(model, target_layer, selected_entities = [], trace: nil)
				return false unless model

				# Limpa qualquer isolamento anterior antes de aplicar novo.
				restore_tag_isolation(model, trace: nil)

				layer_states = {}
				current_layer_id = nil

				if model.respond_to?(:active_layer) && model.active_layer
					current_layer_id = model.active_layer.persistent_id.to_s
				end

				default_layer = model.layers[0]
				target_layers = []
				target_layers << target_layer if target_layer

				Array(selected_entities).each do |entity|
					next unless entity && entity.respond_to?(:layer) && entity.layer
					target_layers << entity.layer
				end

				target_layers.uniq!
				return false if target_layers.empty?

				if model.respond_to?(:active_layer=)
					model.active_layer = target_layers.first if target_layers.first
				end

				model.layers.each do |layer|
					next unless layer
					layer_states[layer.persistent_id.to_s] = layer.visible?

					keep_visible = target_layers.include?(layer)
					# Mantem layer default visivel para nao "sumir faces" de geometria base.
					keep_visible ||= (default_layer && layer == default_layer)

					layer.visible = keep_visible
				end

				@tag_isolation_layer_snapshot = {
					layer_states: layer_states,
					current_layer_id: current_layer_id
				}

				trace&.call("apply_tag_isolation", {
					layers: target_layers.length,
					selected_entities: Array(selected_entities).length
				})
				true
			rescue StandardError => e
				puts("[RelatorioPRO] apply_tag_isolation error: #{e.class}: #{e.message}")
				false
			end

			def restore_tag_isolation(model, trace: nil)
				return false unless model

				restored = false
				if defined?(@tag_isolation_layer_snapshot) && @tag_isolation_layer_snapshot.is_a?(Hash) && !@tag_isolation_layer_snapshot.empty?
					states = @tag_isolation_layer_snapshot[:layer_states]
					if states.is_a?(Hash)
						states.each do |layer_pid, visible_state|
							layer = model.layers.find { |l| l && l.persistent_id.to_s == layer_pid.to_s }
							next unless layer
							layer.visible = !!visible_state
						end
					end

					current_layer_id = @tag_isolation_layer_snapshot[:current_layer_id]
					if current_layer_id && model.respond_to?(:active_layer=)
						layer = model.layers.find { |l| l && l.persistent_id.to_s == current_layer_id.to_s }
						model.active_layer = layer if layer
					end

					@tag_isolation_layer_snapshot = {}
					restored = true
				end

				trace&.call("restore_tag_isolation", { restored: !!restored })
				restored
			rescue StandardError => e
				puts("[RelatorioPRO] restore_tag_isolation error: #{e.class}: #{e.message}")
				false
			end
		end
	end
end