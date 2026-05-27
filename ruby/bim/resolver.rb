require "set"

module RelatorioPRO
	module Bim
		module Resolver
			module_function

			def normalize_tag_name(value)
				value.to_s.strip.upcase.gsub(/\s+/, " ")
			end

			def relaxed_tag_token(value)
				normalize_tag_name(value).gsub(/[^[:alnum:]]+/, "")
			end

			def tag_name_matches?(candidate_name, wanted_name)
				candidate = normalize_tag_name(candidate_name)
				target = normalize_tag_name(wanted_name)
				return false if candidate.empty? || target.empty?
				return true if candidate == target

				candidate_token = relaxed_tag_token(candidate)
				target_token = relaxed_tag_token(target)
				!candidate_token.empty? && candidate_token == target_token
			end

			def find_layer_by_name(model, wanted_name)
				target = wanted_name.to_s.strip
				return nil if target.empty?

				model.layers.each do |layer|
					next unless layer
					return layer if tag_name_matches?(layer.name, target)
				end

				nil
			rescue StandardError
				nil
			end

			def collect_instances_one_level(entities, output, visited = nil)
				# Regra de contagem BIM:
				# - Conta ComponentInstance e Group como entidades válidas.
				# - Se Group for container (tem filhos Group/ComponentInstance), não conta o pai.
				# - Expande apenas 1 nível dentro desse Group.
				# - Nunca recursiona profundamente nem conta faces/arestas.
				visited ||= Set.new
				return unless entities

				entities.each do |entity|
					next unless entity.valid?
					next unless entity.is_a?(Sketchup::ComponentInstance) || entity.is_a?(Sketchup::Group)

					pid = entity.persistent_id
					next if visited.include?(pid)

					if entity.is_a?(Sketchup::Group)
						child_instances = entity.entities.grep(Sketchup::ComponentInstance)
						child_groups = entity.entities.grep(Sketchup::Group)
						children = (child_instances + child_groups).select(&:valid?)

						if !children.empty?
							visited << pid
							children.each do |child|
								child_pid = child.persistent_id
								next if visited.include?(child_pid)
								visited << child_pid
								output << child
							end
							next
						end
					end

					visited << pid
					output << entity
				end
			end

			def collect_entities_by_tag(model, tag_name)
				target = normalize_tag_name(tag_name)
				return [] if target.empty?

				instances = []
				collect_instances_one_level(model.entities, instances)

				instances.select do |entity|
					next false unless entity.respond_to?(:layer) && entity.layer
					tag_name_matches?(entity.layer.name, target)
				end
			end

			def find_entities_by_persistent_ids(model, pids)
				found = []
				seen = Set.new

				Array(pids).each do |pid|
					next if pid.nil?
					numeric = pid.to_i
					next if numeric <= 0
					next if seen.include?(numeric)

					entity = model.find_entity_by_persistent_id(numeric)
					next unless entity

					seen << numeric
					found << entity
				end

				found
			end
		end
	end
end