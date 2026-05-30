# =============================================================================
# DimensionLabelTool — Overlay de bounding box + etiqueta de dimensoes
# =============================================================================
# Inspirado na feature do plugin 5D+ Auto Info.
# Desenha sobre o modelo SketchUp:
#   - Bounding box (12 arestas) pontilhado vermelho ao redor do elemento
#   - Etiqueta verde com texto "X x Y x Z" sobre o elemento
# =============================================================================

require "sketchup"

module RelatorioPRO
	module Tools
		class DimensionLabelTool
			INCH_TO_M = 0.0254

			def initialize
				@entities = []        # array de Sketchup::Entity
				@bounds_cache = nil
				@label_text = nil     # texto customizado (linhas separadas por \n)
			end

			# === Lifecycle ==========================================================

			def activate
				view = Sketchup.active_model.active_view
				view.invalidate if view
			end

			def deactivate(view)
				view.invalidate if view
			end

			def resume(view)
				view.invalidate
			end

			def suspend(view)
				view.invalidate
			end

			# === Public API =========================================================

			# Define um ou mais entities + texto customizado opcional e re-renderiza
			def set_entities(entities, label_text = nil)
				@entities = (entities || []).compact.select { |e| e.respond_to?(:bounds) && e.valid? }
				@bounds_cache = compute_combined_bounds(@entities)
				@label_text = label_text
				view = Sketchup.active_model.active_view
				view.invalidate if view
			end

			def clear
				@entities = []
				@bounds_cache = nil
				@label_text = nil
				view = Sketchup.active_model.active_view
				view.invalidate if view
			end

			# === Drawing ============================================================

			def draw(view)
				return if @entities.empty? || @bounds_cache.nil?

				# Bounding box removido — usamos apenas o highlight nativo
				# do SketchUp (linha azul) + label informativo flutuante
				draw_label(view, @bounds_cache)
			end

			# === Internals ==========================================================

			def compute_combined_bounds(entities)
				return nil if entities.empty?

				bb = Geom::BoundingBox.new
				entities.each do |e|
					next unless e.respond_to?(:bounds) && e.valid?
					eb = world_bounds(e)
					bb.add(eb.min)
					bb.add(eb.max)
				end
				bb
			rescue StandardError
				nil
			end

			# Retorna bounds em coordenadas do mundo (aplicando a transformacao se aplicavel)
			def world_bounds(entity)
				if entity.respond_to?(:transformation) && entity.respond_to?(:definition) && entity.definition
					bb = entity.definition.bounds
					transform = entity.transformation
					world_bb = Geom::BoundingBox.new
					# 8 cantos do bb local transformados para mundo
					corners = [
						bb.min,
						Geom::Point3d.new(bb.max.x, bb.min.y, bb.min.z),
						Geom::Point3d.new(bb.min.x, bb.max.y, bb.min.z),
						Geom::Point3d.new(bb.min.x, bb.min.y, bb.max.z),
						Geom::Point3d.new(bb.max.x, bb.max.y, bb.min.z),
						Geom::Point3d.new(bb.max.x, bb.min.y, bb.max.z),
						Geom::Point3d.new(bb.min.x, bb.max.y, bb.max.z),
						bb.max
					]
					corners.each { |p| world_bb.add(p.transform(transform)) }
					world_bb
				else
					entity.bounds
				end
			rescue StandardError
				entity.bounds
			end

			def draw_label(view, bb)
				lines = label_lines(bb)
				return if lines.empty?

				# Centro do elemento em 3D, projetado para tela
				center = bb.center
				screen_pt = view.screen_coords(center)

				# Offset vertical: label flutua acima do elemento
				screen_pt = Geom::Point3d.new(screen_pt.x, screen_pt.y - 30, 0)

				line_h = 18
				max_line_len = lines.map(&:length).max || 0
				w = max_line_len * 8 + 20
				h = lines.length * line_h + 12

				draw_label_background(view, screen_pt, w, h)
				draw_label_lines(view, screen_pt, lines, line_h)
			rescue StandardError => e
				puts("[DimensionLabelTool] draw_label error: #{e.class}: #{e.message}")
			end

			# Decide o conteudo do label: texto custom (vindo do JS) ou fallback
			# com as dimensoes X x Y x Z.
			def label_lines(bb)
				if @label_text && !@label_text.to_s.strip.empty?
					return @label_text.to_s.split(/\r?\n/).reject(&:empty?)
				end

				x = (bb.width.to_f  * INCH_TO_M).round(2)
				y = (bb.depth.to_f  * INCH_TO_M).round(2)
				z = (bb.height.to_f * INCH_TO_M).round(2)
				[format("%.2f x %.2f x %.2f m", x, y, z)]
			end

			def draw_label_lines(view, anchor, lines, line_h)
				options = {
					:font  => "Arial",
					:size  => 12,
					:bold  => true,
					:color => Sketchup::Color.new(255, 255, 255),
					:align => TextAlignCenter
				}

				start_y = anchor.y - ((lines.length - 1) * line_h) / 2.0
				lines.each_with_index do |line, idx|
					pt = Geom::Point3d.new(anchor.x, start_y + idx * line_h, 0)
					begin
						view.draw_text(pt, line, options)
					rescue StandardError
						view.draw_text(pt, line)
					end
				end
			end

			def draw_label_background(view, anchor, w, h)
				x = anchor.x.to_f
				y = anchor.y.to_f

				p1 = Geom::Point3d.new(x - w / 2, y - h / 2, 0)
				p2 = Geom::Point3d.new(x + w / 2, y - h / 2, 0)
				p3 = Geom::Point3d.new(x + w / 2, y + h / 2, 0)
				p4 = Geom::Point3d.new(x - w / 2, y + h / 2, 0)

				view.drawing_color = Sketchup::Color.new(15, 23, 42, 230)  # cinza escuro
				view.draw2d(GL_QUADS, [p1, p2, p3, p4])

				view.line_width = 1
				view.drawing_color = Sketchup::Color.new(14, 165, 233)  # accent azul
				view.draw2d(GL_LINE_LOOP, [p1, p2, p3, p4])
			rescue StandardError
				nil
			end
		end
	end
end
