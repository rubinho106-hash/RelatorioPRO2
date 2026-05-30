require_relative "python_bridge"
require_relative "ui"
require_relative "bim/resolver"
require_relative "bim/selection_engine"
require_relative "bim/visibility_engine"
require_relative "tools/dimension_label_tool"
require "json"
require "set"
require "time"

module RelatorioPRO
	COMMAND_NAME = "Relatorio Engenharia PRO".freeze
	TOOLBAR_NAME = "Relatorio PRO".freeze
	INCH_TO_M = 0.0254
	INCH2_TO_M2 = 0.000_645_16
	INCH3_TO_M3 = 0.000_016_387_064
	LIVE_REFRESH_DEBOUNCE_SECONDS = 0.35
	CAMERA_FOCUS_DURATION_SECONDS = 0.20
	CAMERA_FOCUS_STEPS = 8
	BIM_TRACE_ENABLED = ENV["BIM_TRACE"].to_s.strip.downcase == "true"
	DYNAMIC_SKIP_DICT_PREFIXES = ["SU_"].freeze
	DYNAMIC_SKIP_KEYS = %w[_formatversion _inst__x _inst__y _inst__z _lenx_formula _leny_formula _lenz_formula].freeze
	MODEL_DEFAULT_SETTINGS = {
		round_length: "0.00",
		format_length: "m",
		round_area: "0.00",
		format_area: "m²",
		round_volume: "0.000",
		format_volume: "m³",
		decimal_separator: ".",
		concrete_cover_thickness_m: 0.05,
		slab_mode: "nervurada",
		slab_ribbed_factor_m: 0.10,
		concrete_density_kg_m3: 2500.0,
		concrete_cost_per_m3: 0.0,
		eps_cost_per_m3: 0.0
	}.freeze

	module_function

	class DashboardSelectionObserver < Sketchup::SelectionObserver
		def onSelectionBulkChange(selection)
			RelatorioPRO.handle_sketchup_selection_change(selection)
		end

		def onSelectionAdded(selection, _entity)
			RelatorioPRO.handle_sketchup_selection_change(selection)
		end

		def onSelectionRemoved(selection, _entity)
			RelatorioPRO.handle_sketchup_selection_change(selection)
		end

		def onSelectionCleared(selection)
			RelatorioPRO.handle_sketchup_selection_change(selection)
		end
	end

	class DashboardModelObserver < Sketchup::ModelObserver
		def onTransactionCommit(model)
			RelatorioPRO.schedule_live_refresh("transaction_commit", model)
		end

		def onTransactionUndo(model)
			RelatorioPRO.schedule_live_refresh("transaction_undo", model)
		end

		def onTransactionRedo(model)
			RelatorioPRO.schedule_live_refresh("transaction_redo", model)
		end

		def onEraseAll(model)
			RelatorioPRO.schedule_live_refresh("erase_all", model)
		end

		def onActivePathChanged(model)
			RelatorioPRO.attach_entities_observer(model)
			RelatorioPRO.schedule_live_refresh("active_path_changed", model)
		end
	end

	class DashboardEntitiesObserver < Sketchup::EntitiesObserver
		def onElementAdded(_entities, entity)
			RelatorioPRO.schedule_live_refresh("entity_added", entity)
		end

		def onElementRemoved(_entities, entity_id)
			RelatorioPRO.schedule_live_refresh("entity_removed", entity_id)
		end

		def onElementModified(_entities, entity)
			RelatorioPRO.schedule_live_refresh("entity_modified", entity)
		end
	end

	def project_root
		File.expand_path("..", __dir__)
	end

	def dialog_file
		File.join(project_root, "ui", "dialog.html")
	end

	def toolbar_icon_path(size)
		File.join(project_root, "ui", "images", "toolbar", "relatoriopro_#{size}.png")
	end

	def open_dialog
		if defined?(@dialog) && @dialog && @dialog.visible?
			@dialog.bring_to_front
			return
		end

		@dialog = ::UI::HtmlDialog.new(
			dialog_title: COMMAND_NAME,
			width: 1480,
			height: 920,
			min_width: 1100,
			min_height: 700,
			style: ::UI::HtmlDialog::STYLE_DIALOG
		)

		@dialog.set_file(dialog_file)
		register_dialog_callbacks(@dialog)
		register_runtime_callbacks(@dialog)

		@dialog.set_on_closed do
			restore_tag_isolation
			detach_runtime_observers
			cancel_live_refresh_timer
			detach_selection_observer
			reset_live_caches
			@dialog = nil
		end

		attach_runtime_observers
		attach_selection_observer
		@dialog.show
	rescue StandardError => e
		::UI.messagebox("RelatorioPRO: falha ao abrir painel.\n\n#{e.class}: #{e.message}")
	end

	def plugin_command
		return @plugin_command if defined?(@plugin_command) && @plugin_command

		@plugin_command = ::UI::Command.new(COMMAND_NAME) { open_dialog }
		small_icon = toolbar_icon_path(24)
		large_icon = toolbar_icon_path(32)
		@plugin_command.small_icon = small_icon if File.exist?(small_icon)
		@plugin_command.large_icon = large_icon if File.exist?(large_icon)
		@plugin_command.menu_text = COMMAND_NAME
		@plugin_command.tooltip = COMMAND_NAME
		@plugin_command.status_bar_text = "Abrir dashboard do RelatorioPRO"
		@plugin_command
	end

	def register_toolbar
		return @toolbar if defined?(@toolbar) && @toolbar

		@toolbar = ::UI::Toolbar.new(TOOLBAR_NAME)
		@toolbar.add_item(plugin_command)
		@toolbar.restore
		@toolbar
	end

	def register_menu
		menu = ::UI.menu("Plugins")
		menu.add_item(plugin_command)
		menu.add_submenu("RelatorioPRO").add_item("Abrir Dashboard") { open_dialog }
	end

	def init_ui
		return if defined?(@ui_initialized) && @ui_initialized

		register_menu
		register_toolbar
		@ui_initialized = true
	end

	def run_ifc_pipeline
		PythonBridge.run_extract_ifc
	end

	def run_grouping
		PythonBridge.run_grouping
	end

	def run_analytics
		PythonBridge.run_analytics
	end

	def run_full_pipeline
		PythonBridge.run_full_pipeline
	end

	def register_dialog_callbacks(dialog)
		UI.register_pipeline_callbacks(dialog)
	end

	def register_runtime_callbacks(dialog)
		dialog.add_action_callback("ready") do |_ctx|
			# Front-end notifica quando terminou de carregar.
			nil
		end

		dialog.add_action_callback("request_data") do |_ctx|
			push_model_data_to_dialog(dialog)
		end

		dialog.add_action_callback("run_full_pipeline") do |_ctx|
			push_model_data_to_dialog(dialog)
		end

		dialog.add_action_callback("highlight") do |_ctx, pid|
			select_entities([pid])
		end

		dialog.add_action_callback("select_entity") do |_ctx, pid|
			select_entities([pid], clear: false)
		end

		dialog.add_action_callback("clear_selection") do |_ctx|
			Sketchup.active_model.selection.clear
		end

		dialog.add_action_callback("select_tag_entities") do |_ctx, tag_name, focus, isolate|
			select_tag_entities(tag_name, focus: focus, isolate: isolate)
		end

		dialog.add_action_callback("clear_tag_isolation") do |_ctx|
			restore_tag_isolation
		end

		dialog.add_action_callback("zoomSelection") do |_ctx|
			selection_entities = Sketchup.active_model.selection.to_a
			focus_camera_on_entities(selection_entities, smooth: true)
		end

		dialog.add_action_callback("focus_entity") do |_ctx, pid|
			entities = select_entities([pid])
			focus_camera_on_entities(entities, smooth: true) unless entities.empty?
		end

		dialog.add_action_callback("zoom_entity") do |_ctx, pid|
			entities = select_entities([pid])
			Sketchup.active_model.active_view.zoom(entities) unless entities.empty?
		end

		dialog.add_action_callback("export_excel") do |_ctx|
			# Export is handled on front-end via XLSX.
			nil
		end

		dialog.add_action_callback("export_csv") do |_ctx|
			# Reserved callback for future backend CSV export.
			nil
		end

		dialog.add_action_callback("log") do |_ctx, message|
			puts("[RelatorioPRO] #{message}")
		end

		dialog.add_action_callback("show_dimension_label") do |_ctx, pid, label_text|
			show_dimension_label_for(pid, label_text)
		end

		dialog.add_action_callback("clear_dimension_label") do |_ctx|
			clear_dimension_label
		end

		dialog.add_action_callback("smart_focus") do |_ctx, pid|
			puts("[callback smart_focus] pid=#{pid.inspect}")
			model = Sketchup.active_model
			next unless model
			entity = model.find_entity_by_persistent_id(pid.to_i)
			puts("[callback smart_focus] entity=#{entity ? entity.class : 'nil'}")
			smart_focus_on_entity(entity) if entity && entity.valid?
		end
	end

	# === DIMENSION LABEL OVERLAY =================================================
	# Inspirado no plugin 5D+ Auto Info: destaca elemento com bounding box
	# pontilhado e etiqueta verde de dimensoes X x Y x Z.

	def dimension_label_tool
		@dimension_label_tool ||= Tools::DimensionLabelTool.new
	end

	def show_dimension_label_for(pid, label_text = nil)
		model = Sketchup.active_model
		return unless model

		entity = model.find_entity_by_persistent_id(pid.to_i)
		return unless entity && entity.valid?

		tool = dimension_label_tool
		tool.set_entities([entity], label_text)

		# Ativa a tool apenas se nao for a atual (evita re-ativar a cada clique)
		if model.tools.active_tool_name != "DimensionLabelTool"
			model.select_tool(tool)
		else
			view = model.active_view
			view.invalidate if view
		end
	rescue StandardError => e
		puts("[RelatorioPRO] show_dimension_label_for error: #{e.class}: #{e.message}")
	end

	def clear_dimension_label
		return unless @dimension_label_tool

		@dimension_label_tool.clear
		model = Sketchup.active_model
		return unless model

		if model.tools.active_tool_name == "DimensionLabelTool"
			model.select_tool(nil)
		end
	rescue StandardError => e
		puts("[RelatorioPRO] clear_dimension_label error: #{e.class}: #{e.message}")
	end

	def bim_trace(event_name, payload = {})
		return unless BIM_TRACE_ENABLED

		normalized = {
			event: event_name.to_s,
			ts: Time.now.utc.iso8601(3)
		}.merge(payload)
		puts("[RelatorioPRO][BIM_TRACE] #{JSON.generate(normalized)}")
	rescue StandardError
		# tracing nunca deve quebrar runtime
		nil
	end

	def select_entities(pids, clear: true)
		model = Sketchup.active_model
		return [] unless model

		Bim::SelectionEngine.select_entities(
			model,
			pids,
			clear: clear,
			trace: method(:bim_trace)
		)
	end

	def select_tag_entities(tag_name, focus: false, isolate: false)
		model = Sketchup.active_model
		Bim::SelectionEngine.select_tag_entities(
			model: model,
			tag_name: tag_name,
			focus: focus,
			isolate: isolate,
			trace: method(:bim_trace),
			on_focus: proc { |entities| focus_camera_on_entities(entities, smooth: true) },
			on_isolate: proc { |layer, entities| apply_tag_isolation(layer, entities) },
			on_restore: proc { restore_tag_isolation }
		)
	end

	def apply_tag_isolation(target_layer, selected_entities = [])
		model = Sketchup.active_model
		Bim::VisibilityEngine.apply_tag_isolation(model, target_layer, selected_entities, trace: method(:bim_trace))
	end

	def restore_tag_isolation
		model = Sketchup.active_model
		return false unless model

		restored = Bim::VisibilityEngine.restore_tag_isolation(model, trace: method(:bim_trace))

		# Compatibilidade: restaura snapshot antigo por entidade.hidden, se existir.
		if defined?(@tag_isolation_snapshot) && @tag_isolation_snapshot.is_a?(Hash) && !@tag_isolation_snapshot.empty?
			@tag_isolation_snapshot.each do |pid, hidden_state|
				entity = model.find_entity_by_persistent_id(pid.to_i)
				next unless entity && entity.valid?
				next unless entity.respond_to?(:hidden=)
				entity.hidden = !!hidden_state
			end
			@tag_isolation_snapshot = {}
			restored = true
		end

		restored
	rescue StandardError => e
		puts("[RelatorioPRO] restore_tag_isolation error: #{e.class}: #{e.message}")
		false
	end

	def normalize_tag_name(value)
		Bim::Resolver.normalize_tag_name(value)
	end

	def relaxed_tag_token(value)
		Bim::Resolver.relaxed_tag_token(value)
	end

	def tag_name_matches?(candidate_name, wanted_name)
		Bim::Resolver.tag_name_matches?(candidate_name, wanted_name)
	end

	def find_layer_by_name(model, wanted_name)
		Bim::Resolver.find_layer_by_name(model, wanted_name)
	end

	def collect_entities_by_tag(model, tag_name)
		Bim::Resolver.collect_entities_by_tag(model, tag_name)
	end

	# =============================================================================
	# SMART FOCUS — escolhe o melhor angulo de camera baseado na geometria
	# =============================================================================
	# Analisa as dimensoes X/Y/Z do elemento e decide:
	#   - Vertical (Z >> X,Y): pilar → vista frontal-isometrica
	#   - Horizontal (X*Y >> Z): laje → vista superior em angulo
	#   - Linear (X >> Y,Z): viga → vista lateral isometrica
	#   - Cubico: isometrica padrao 3/4
	def smart_focus_on_entity(entity)
		puts("[smart_focus] ENTROU — entity=#{entity.inspect}")
		model = Sketchup.active_model
		unless model
			puts("[smart_focus] sem active_model"); return false
		end

		view = model.active_view
		unless view
			puts("[smart_focus] sem active_view"); return false
		end
		unless entity && entity.valid?
			puts("[smart_focus] entity invalida"); return false
		end

		bb = world_bounds_of(entity)
		unless bb
			puts("[smart_focus] world_bounds_of retornou nil"); return false
		end

		target = bb.center
		w = bb.width.to_f
		d = bb.depth.to_f
		h = bb.height.to_f
		puts("[smart_focus] bbox(inches): w=#{w.round(2)} d=#{d.round(2)} h=#{h.round(2)}")

		diag = Math.sqrt(w * w + d * d + h * h)
		if diag < 0.001
			puts("[smart_focus] diag muito pequena: #{diag}"); return false
		end

		max_horizontal = [w, d].max
		shape =
			if h > 1.8 * max_horizontal
				:vertical
			elsif (w * d) > 2.5 * (h * [w, d].max)
				:horizontal
			elsif w > 1.8 * d && w > 1.8 * h
				:linear_x
			elsif d > 1.8 * w && d > 1.8 * h
				:linear_y
			else
				:isometric
			end
		puts("[smart_focus] shape=#{shape}")

		dir =
			case shape
			when :vertical   then Geom::Vector3d.new( 1.0, -1.5,  0.4)
			when :horizontal then Geom::Vector3d.new( 0.8, -0.8,  1.4)
			when :linear_x   then Geom::Vector3d.new( 0.2, -1.5,  0.6)
			when :linear_y   then Geom::Vector3d.new(-1.5, -0.2,  0.6)
			else                  Geom::Vector3d.new( 1.0, -1.0,  0.8)
			end
		dir.normalize!

		camera = view.camera
		# Garante modo perspectiva — em paralelo, FOV nao funciona
		unless camera.perspective?
			puts("[smart_focus] forcando camera para perspective")
			camera.perspective = true
		end

		fov_deg = (camera.fov || 35).to_f
		fov_deg = 35.0 if fov_deg <= 0
		fov_rad = fov_deg * Math::PI / 180.0
		distance = (diag * 0.5) / Math.tan(fov_rad / 2.0) / 0.6
		distance = [distance, diag * 1.2].max
		puts("[smart_focus] fov=#{fov_deg} diag=#{diag.round(2)} distance=#{distance.round(2)}")

		new_eye = target.offset(dir.reverse, distance)
		new_up  = Geom::Vector3d.new(0, 0, 1)
		puts("[smart_focus] target=#{target.inspect} new_eye=#{new_eye.inspect}")

		animate_camera_transition(
			view,
			camera.eye, new_eye,
			camera.target, target,
			new_up,
			CAMERA_FOCUS_DURATION_SECONDS,
			CAMERA_FOCUS_STEPS
		)

		puts("[smart_focus] animacao agendada com #{CAMERA_FOCUS_STEPS} steps")
		bim_trace("smart_focus", shape: shape, w_m: (w * INCH_TO_M).round(2),
								 d_m: (d * INCH_TO_M).round(2), h_m: (h * INCH_TO_M).round(2))
		true
	rescue StandardError => e
		puts("[RelatorioPRO] smart_focus_on_entity error: #{e.class}: #{e.message}")
		puts(e.backtrace.first(5).join("\n"))
		false
	end

	def world_bounds_of(entity)
		if entity.respond_to?(:transformation) && entity.respond_to?(:definition) && entity.definition
			local_bb = entity.definition.bounds
			t = entity.transformation
			bb = Geom::BoundingBox.new
			# 8 cantos do bbox local transformados
			[
				local_bb.min,
				Geom::Point3d.new(local_bb.max.x, local_bb.min.y, local_bb.min.z),
				Geom::Point3d.new(local_bb.min.x, local_bb.max.y, local_bb.min.z),
				Geom::Point3d.new(local_bb.min.x, local_bb.min.y, local_bb.max.z),
				Geom::Point3d.new(local_bb.max.x, local_bb.max.y, local_bb.min.z),
				Geom::Point3d.new(local_bb.max.x, local_bb.min.y, local_bb.max.z),
				Geom::Point3d.new(local_bb.min.x, local_bb.max.y, local_bb.max.z),
				local_bb.max
			].each { |p| bb.add(p.transform(t)) }
			bb
		else
			entity.bounds
		end
	rescue StandardError
		entity.bounds
	end

	def focus_camera_on_entities(entities, smooth: true)
		model = Sketchup.active_model
		return false unless model

		view = model.active_view
		return false unless view

		list = Array(entities).compact.select { |entity| entity.respond_to?(:valid?) && entity.valid? }
		return false if list.empty?

		target = combined_entities_center(list)
		return false unless target

		camera = view.camera
		distance = camera.eye.distance(camera.target)
		return false unless distance.is_a?(Numeric) && distance.finite? && distance > 0.001

		direction = camera.direction
		new_eye = target.offset(direction.reverse, distance)

		if smooth
			animate_camera_transition(
				view,
				camera.eye,
				new_eye,
				camera.target,
				target,
				camera.up,
				CAMERA_FOCUS_DURATION_SECONDS,
				CAMERA_FOCUS_STEPS
			)
		else
			camera.set(new_eye, target, camera.up)
			view.camera = camera
			view.invalidate
		end

		bim_trace("focus_camera_on_entities", entities: list.length, smooth: !!smooth)

		true
	rescue StandardError => e
		puts("[RelatorioPRO] focus_camera_on_entities error: #{e.class}: #{e.message}")
		false
	end

	def combined_entities_center(entities)
		bounds = Geom::BoundingBox.new
		Array(entities).each do |entity|
			next unless entity.respond_to?(:bounds)
			bounds.add(entity.bounds)
		end

		return nil if bounds.empty?

		bounds.center
	rescue StandardError
		nil
	end

	def animate_camera_transition(view, from_eye, to_eye, from_target, to_target, up, duration_seconds, steps)
		frame_count = [[steps.to_i, 1].max, 60].min
		interval = [duration_seconds.to_f / frame_count, 0.01].max
		frame = 0
		timer_id = nil

		# IMPORTANTE: ::UI (global) — sem prefixo o Ruby resolve para
		# RelatorioPRO::UI (modulo interno do plugin) que nao tem start_timer
		timer_id = ::UI.start_timer(interval, true) do
			frame += 1
			t = [frame.to_f / frame_count, 1.0].min

			eye = lerp_point3d(from_eye, to_eye, t)
			target = lerp_point3d(from_target, to_target, t)

			camera = view.camera
			camera.set(eye, target, up)
			view.camera = camera
			view.invalidate

			if frame >= frame_count
				::UI.stop_timer(timer_id) if timer_id
			end
		end
	rescue StandardError => e
		puts("[RelatorioPRO] animate_camera_transition error: #{e.class}: #{e.message}")
	end

	def lerp_point3d(from_point, to_point, t)
		Geom::Point3d.new(
			from_point.x + ((to_point.x - from_point.x) * t),
			from_point.y + ((to_point.y - from_point.y) * t),
			from_point.z + ((to_point.z - from_point.z) * t)
		)
	end

	def attach_selection_observer
		model = Sketchup.active_model
		return unless model
		return if defined?(@selection_observer) && @selection_observer

		@selection_observer = DashboardSelectionObserver.new
		model.selection.add_observer(@selection_observer)
	rescue StandardError => e
		puts("[RelatorioPRO] attach_selection_observer error: #{e.class}: #{e.message}")
	end

	def attach_runtime_observers
		model = Sketchup.active_model
		return unless model

		if defined?(@observed_model) && @observed_model && @observed_model != model
			detach_runtime_observers
			reset_live_caches
		end

		unless defined?(@model_observer) && @model_observer
			@model_observer = DashboardModelObserver.new
			model.add_observer(@model_observer)
		end

		unless defined?(@entities_observer) && @entities_observer
			@entities_observer = DashboardEntitiesObserver.new
		end

		attach_entities_observer(model)
		@observed_model = model
	rescue StandardError => e
		puts("[RelatorioPRO] attach_runtime_observers error: #{e.class}: #{e.message}")
	end

	def attach_entities_observer(model = Sketchup.active_model)
		return unless model
		return unless defined?(@entities_observer) && @entities_observer

		target_entities = model.respond_to?(:active_entities) ? model.active_entities : model.entities
		if defined?(@observed_entities) && @observed_entities && @observed_entities != target_entities
			@observed_entities.remove_observer(@entities_observer)
			@observed_entities = nil
		end

		unless defined?(@observed_entities) && @observed_entities == target_entities
			target_entities.add_observer(@entities_observer)
			@observed_entities = target_entities
		end
	rescue StandardError => e
		puts("[RelatorioPRO] attach_entities_observer error: #{e.class}: #{e.message}")
	end

	def detach_runtime_observers
		cancel_live_refresh_timer

		if defined?(@observed_entities) && @observed_entities && defined?(@entities_observer) && @entities_observer
			@observed_entities.remove_observer(@entities_observer)
		end

		if defined?(@observed_model) && @observed_model && defined?(@model_observer) && @model_observer
			@observed_model.remove_observer(@model_observer)
		end

		@observed_entities = nil
		@observed_model = nil
		@entities_observer = nil
		@model_observer = nil
	rescue StandardError => e
		puts("[RelatorioPRO] detach_runtime_observers error: #{e.class}: #{e.message}")
	ensure
		@live_refresh_in_progress = false
	end

	def detach_selection_observer
		model = Sketchup.active_model
		return unless model
		return unless defined?(@selection_observer) && @selection_observer

		model.selection.remove_observer(@selection_observer)
		@selection_observer = nil
	rescue StandardError => e
		puts("[RelatorioPRO] detach_selection_observer error: #{e.class}: #{e.message}")
	end

	def handle_sketchup_selection_change(selection)
		return unless defined?(@dialog) && @dialog && @dialog.visible?

		ids = []
		if selection && !selection.empty?
			selection.each do |entity|
				next unless entity.respond_to?(:persistent_id)
				ids << entity.persistent_id.to_s
			end
		end

		signature = ids.join(",")
		now = Time.now.to_f
		if defined?(@last_selection_signature) && @last_selection_signature == signature
			last_push = defined?(@last_selection_push_at) ? @last_selection_push_at.to_f : 0.0
			return if (now - last_push) < 0.12
		end

		@last_selection_signature = signature
		@last_selection_push_at = now

		payload = JSON.generate({ ids: ids })
		@dialog.execute_script("window.dispatchEvent(new CustomEvent('relatoriopro:selectionChanged', { detail: #{payload} }));")
	rescue StandardError => e
		puts("[RelatorioPRO] selection sync error: #{e.class}: #{e.message}")
	end

	def schedule_live_refresh(source = nil, origin = nil)
		return unless defined?(@dialog) && @dialog && @dialog.visible?
		return if defined?(@live_refresh_in_progress) && @live_refresh_in_progress

		mark_live_dirty(source, origin)

		cancel_live_refresh_timer
		@live_refresh_timer = ::UI.start_timer(LIVE_REFRESH_DEBOUNCE_SECONDS, false) do
			@live_refresh_timer = nil
			perform_live_refresh
		end
	rescue StandardError => e
		puts("[RelatorioPRO] schedule_live_refresh error: #{e.class}: #{e.message}")
	end

	def perform_live_refresh
		return unless defined?(@dialog) && @dialog && @dialog.visible?
		return if defined?(@live_refresh_in_progress) && @live_refresh_in_progress
		return unless live_refresh_needed?

		@live_refresh_in_progress = true
		push_model_data_to_dialog(@dialog)
		clear_live_dirty
	rescue StandardError => e
		puts("[RelatorioPRO] perform_live_refresh error: #{e.class}: #{e.message}")
	ensure
		@live_refresh_in_progress = false
	end

	def cancel_live_refresh_timer
		return unless defined?(@live_refresh_timer) && @live_refresh_timer

		::UI.stop_timer(@live_refresh_timer)
		@live_refresh_timer = nil
	rescue StandardError => e
		puts("[RelatorioPRO] cancel_live_refresh_timer error: #{e.class}: #{e.message}")
	ensure
		@live_refresh_timer = nil
	end

	def reset_live_caches
		@rows_cache = {}
		@dirty_entities = Set.new
		@dirty_tags = Set.new
		@dynamic_schema_registry = {}
		@full_refresh_required = true
		@last_refresh_reason = nil
	end

	def mark_live_dirty(source, origin)
		@dirty_entities ||= Set.new
		@dirty_tags ||= Set.new

		case source.to_s
		when "entity_added", "entity_modified"
			mark_dirty_entity(origin)
		when "entity_removed", "erase_all", "transaction_undo", "transaction_redo", "active_path_changed"
			@full_refresh_required = true
		when "transaction_commit"
			# Keep incremental when entity callbacks provided dirty IDs; fallback to full if nothing marked.
			@full_refresh_required = true if @dirty_entities.empty? && @dirty_tags.empty?
		else
			@full_refresh_required = true
		end

		@last_refresh_reason = source
	end

	def mark_dirty_entity(entity)
		return unless entity && entity.respond_to?(:persistent_id)

		pid = entity.persistent_id.to_s
		@dirty_entities << pid unless pid.empty?

		tag_name = if entity.respond_to?(:layer) && entity.layer
			entity.layer.name.to_s.upcase
		else
			""
		end
		@dirty_tags << tag_name unless tag_name.empty?
	rescue StandardError
		@full_refresh_required = true
	end

	def live_refresh_needed?
		return true if !defined?(@rows_cache) || @rows_cache.nil? || @rows_cache.empty?
		return true if defined?(@full_refresh_required) && @full_refresh_required
		return true if defined?(@dirty_entities) && !@dirty_entities.empty?
		return true if defined?(@dirty_tags) && !@dirty_tags.empty?

		false
	end

	def clear_live_dirty
		@dirty_entities = Set.new
		@dirty_tags = Set.new
		@full_refresh_required = false
	end

	def push_model_data_to_dialog(dialog)
		rows = extract_rows_from_active_model
		layer_list = rows.map { |row| row[:tag].to_s }.uniq.sort
		ifc_summary = build_ifc_summary(rows)
		dynamic_list = defined?(@dynamic_schema_list) && @dynamic_schema_list.is_a?(Array) ? @dynamic_schema_list : []
		custom_keys = defined?(@dynamic_schema_keys) && @dynamic_schema_keys.is_a?(Array) ? @dynamic_schema_keys : []

		script = "window.updateData(#{JSON.generate(rows)}, #{JSON.generate(MODEL_DEFAULT_SETTINGS)}, #{JSON.generate(layer_list)}, #{JSON.generate(dynamic_list)}, #{JSON.generate(custom_keys)}, #{JSON.generate(ifc_summary)}); window.relatorioDataSource='sketchup-model';"
		dialog.execute_script(script)

		{ success: true, source: "sketchup-model", total_elements: rows.length }
	rescue StandardError => e
		puts("[RelatorioPRO] request_data error: #{e.class}: #{e.message}")
		{ success: false, source: "sketchup-model", error: e.message }
	end

	def extract_rows_from_active_model
		model = Sketchup.active_model
		return [] unless model
		reset_live_caches unless defined?(@rows_cache) && @rows_cache

		instances = []
		collect_instances_recursive(model.entities, instances)
		alive_ids = Set.new
		rows = []

		instances.each_with_index do |entity, index|
			pid = entity.persistent_id.to_s
			alive_ids << pid

			cached = @rows_cache[pid]
			if can_reuse_cached_row?(entity, cached)
				row = cached.dup
				row[:ordinal] = index + 1
				rows << row
				next
			end

			row = build_row_from_entity(entity, index + 1)
			@rows_cache[pid] = row
			rows << row
		end

		@rows_cache.delete_if { |pid, _| !alive_ids.include?(pid) }

		apply_dynamic_schema(rows)

		rows
	end

	def can_reuse_cached_row?(entity, cached)
		return false unless cached.is_a?(Hash)
		return false if defined?(@full_refresh_required) && @full_refresh_required

		pid = entity.persistent_id.to_s
		return false if defined?(@dirty_entities) && @dirty_entities.include?(pid)

		tag_name = (entity.layer && !entity.layer.name.to_s.empty?) ? entity.layer.name.to_s.upcase : "UNTAGGED"
		return false if defined?(@dirty_tags) && @dirty_tags.include?(tag_name)

		true
	end

	def collect_instances_recursive(entities, output, visited = nil)
		Bim::Resolver.collect_instances_one_level(entities, output, visited)
	end

	def build_row_from_entity(entity, ordinal)
		pid = entity.persistent_id.to_s
		tag_name = (entity.layer && !entity.layer.name.to_s.empty?) ? entity.layer.name.to_s : "UNTAGGED"
		ifc_type = infer_ifc_type_from_tag(tag_name)
		label = entity.name.to_s.strip
		label = entity.definition.name.to_s.strip if label.empty? && entity.respond_to?(:definition) && entity.definition
		label = "#{entity.typename} #{pid}" if label.empty?

		metrics = entity_metrics(entity)
		dynamic_attrs = dynamic_bim_attributes_for(entity)

		row = {
			ordinal: ordinal,
			id: pid,
			entity: pid,
			definition: label,
			instance: label,
			description: label,
			material: "-",
			storey: "SEM PAVIMENTO",
			ifc: ifc_type,
			tag: tag_name.upcase,
			tipo: ifc_type,
			quantidade: 1,
			quantity: 1,
			comprimento: metrics[:length_m],
			metro_linear_total: metrics[:length_m],
			area: metrics[:area_m2],
			volume: metrics[:volume_m3],
			area_total: metrics[:area_m2],
			volume_total: metrics[:volume_m3],
			# Dimensoes individuais do bounding box (m)
			len_x: metrics[:len_x],
			len_y: metrics[:len_y],
			len_z: metrics[:len_z],
			len_xy: metrics[:len_xy],
			len_xz: metrics[:len_xz],
			len_xyz: metrics[:len_xyz],
			area_xy: metrics[:area_xy],
			area_xz: metrics[:area_xz],
			custom: "",
			total: 0,
			is_group: false,
			highlight_id: pid,
			persistent_id: pid
		}

		dynamic_attrs.each_pair do |key, value|
			row[key.to_sym] = value
		end

		row
	end

	def apply_dynamic_schema(rows)
		dynamic_keys = rows.flat_map do |row|
			row.keys.map(&:to_s).select { |key| key.start_with?("bim_") }
		end.uniq.sort

		rows.each do |row|
			dynamic_keys.each do |key|
				sym_key = key.to_sym
				row[sym_key] = "" unless row.key?(sym_key)
			end
		end

		primary_key = dynamic_keys.first
		rows.each do |row|
			row[:custom] = primary_key ? row[primary_key.to_sym].to_s : ""
		end

		@dynamic_schema_keys = dynamic_keys
		@dynamic_schema_list = dynamic_keys.map do |key|
			meta = dynamic_schema_meta_for_key(rows, key)
			{
				key: key,
				label: meta[:label],
				category: meta[:category],
				type: meta[:type],
				dictionary: meta[:dictionary],
				property: meta[:property]
			}
		end
	end

	def dynamic_schema_meta_for_key(rows, key)
		registry = defined?(@dynamic_schema_registry) && @dynamic_schema_registry.is_a?(Hash) ? @dynamic_schema_registry : {}
		entry = registry[key] || {}
		dict_name = entry[:dictionary].to_s
		prop_name = entry[:property].to_s

		values = rows.map { |row| row[key.to_sym] }.compact.map(&:to_s).map(&:strip).reject(&:empty?)
		{
			label: dynamic_schema_human_label(dict_name, prop_name, key),
			category: dynamic_schema_category(dict_name),
			type: infer_dynamic_value_type(values),
			dictionary: dict_name,
			property: prop_name
		}
	end

	def dynamic_bim_attributes_for(entity)
		result = {}
		sources = [entity]
		sources << entity.definition if entity.respond_to?(:definition) && entity.definition

		sources.compact.each do |source|
			dicts = source.attribute_dictionaries
			next unless dicts

			dicts.each do |dict|
				next unless dict
				dict_name = dict.name.to_s
				next if dict_name.empty?
				next if DYNAMIC_SKIP_DICT_PREFIXES.any? { |prefix| dict_name.start_with?(prefix) }

				dict.each_pair do |raw_key, raw_value|
					next if dynamic_attribute_skip?(raw_key, raw_value)

					key = dynamic_schema_key(dict_name, raw_key)
					next if key.empty?

					result[key] = normalize_dynamic_value(raw_value)
				end
			end
		end

		result
	rescue StandardError
		{}
	end

	def dynamic_attribute_skip?(raw_key, raw_value)
		key = raw_key.to_s
		return true if key.empty?
		return true if key.start_with?("_")
		return true if DYNAMIC_SKIP_KEYS.include?(key.downcase)
		return true if key.downcase.end_with?("_formula")

		value = raw_value.nil? ? "" : raw_value.to_s.strip
		value.empty?
	end

	def dynamic_schema_key(dict_name, raw_key)
		dict_token = normalize_schema_token(dict_name)
		key_token = normalize_schema_token(raw_key)
		return "" if dict_token.empty? || key_token.empty?

		key = "bim_#{dict_token}_#{key_token}"
		@dynamic_schema_registry ||= {}
		@dynamic_schema_registry[key] ||= {
			dictionary: dict_name.to_s,
			property: raw_key.to_s
		}

		key
	end

	def normalize_schema_token(value)
		value.to_s.downcase.gsub(/[^a-z0-9]+/, "_").gsub(/\A_+|_+\z/, "")
	end

	def normalize_dynamic_value(value)
		case value
		when TrueClass then "true"
		when FalseClass then "false"
		when Numeric then value.round(6).to_s
		when Array then value.map(&:to_s).join(", ")
		else value.to_s
		end
	end

	def dynamic_schema_label(key)
		key.to_s.sub(/\Abim_/, "").split("_").map(&:capitalize).join(" ")
	end

	def dynamic_schema_human_label(dict_name, property_name, key)
		dict_part = humanize_schema_token(dict_name)
		prop_part = humanize_schema_token(property_name)
		return "#{dict_part} • #{prop_part}" unless dict_part.empty? || prop_part.empty?

		dynamic_schema_label(key)
	end

	def humanize_schema_token(value)
		tokens = value.to_s.gsub(/[^A-Za-z0-9]+/, " ").strip.split(/\s+/)
		return "" if tokens.empty?

		tokens.map do |token|
			next token.upcase if token.match?(/\A[A-Z0-9]{2,}\z/)
			token[0].to_s.upcase + token[1..].to_s.downcase
		end.join(" ")
	end

	def dynamic_schema_category(dict_name)
		name = dict_name.to_s.downcase
		return "IFC" if name.include?("ifc")
		return "Revit" if name.include?("revit")
		return "Estrutural" if name.include?("struct") || name.include?("estrutura")
		return "Materiais" if name.include?("material")
		return "QA/QC" if name.include?("qaqc") || name.include?("qa") || name.include?("qc")

		"Custom"
	end

	def infer_dynamic_value_type(values)
		return "string" if values.nil? || values.empty?

		norm = values.map(&:downcase)
		if norm.all? { |v| v == "true" || v == "false" }
			return "boolean"
		end

		if values.all? { |v| v.match?(/\A-?\d+(?:[\.,]\d+)?\z/) }
			return "number"
		end

		unique_values = values.uniq
		return "enum" if unique_values.length <= 12

		"string"
	end

	def entity_metrics(entity)
		dims = bounding_box_dims_m(entity)
		{
			length_m: dims[:max_m],
			area_m2: safe_entity_area_m2(entity),
			volume_m3: safe_entity_volume_m3(entity),
			len_x: dims[:x],
			len_y: dims[:y],
			len_z: dims[:z],
			len_xy: dims[:xy_text],
			len_xz: dims[:xz_text],
			len_xyz: dims[:xyz_text],
			area_xy: dims[:area_xy],
			area_xz: dims[:area_xz]
		}
	end

	# Extrai dimensoes do bounding box do entity em metros.
	# Retorna hash com x, y, z lineares + areas calculadas + textos concatenados.
	def bounding_box_dims_m(entity)
		empty = { x: 0, y: 0, z: 0, max_m: 0,
				  xy_text: "", xz_text: "", xyz_text: "",
				  area_xy: 0, area_xz: 0 }
		return empty unless entity.respond_to?(:bounds) && entity.bounds

		bb = entity.bounds
		# SketchUp bounds: width = eixo X, depth = eixo Y, height = eixo Z
		x = (bb.width.to_f  * INCH_TO_M).round(4)
		y = (bb.depth.to_f  * INCH_TO_M).round(4)
		z = (bb.height.to_f * INCH_TO_M).round(4)

		{
			x: x,
			y: y,
			z: z,
			max_m: [x, y, z].max,
			xy_text:  format("%.2f x %.2f",        x, y),
			xz_text:  format("%.2f x %.2f",        x, z),
			xyz_text: format("%.2f x %.2f x %.2f", x, y, z),
			area_xy: (x * y).round(4),
			area_xz: (x * z).round(4)
		}
	rescue StandardError
		empty
	end

	def safe_entity_length_m(entity)
		return 0 unless entity.respond_to?(:bounds) && entity.bounds

		bb = entity.bounds
		dims_m = [bb.width.to_f, bb.height.to_f, bb.depth.to_f].map { |v| v * INCH_TO_M }
		dims_m.max.round(4)
	rescue StandardError
		0
	end

	def safe_entity_area_m2(entity)
		return 0 unless entity.respond_to?(:definition) && entity.definition

		transform = entity.respond_to?(:transformation) ? entity.transformation : Geom::Transformation.new
		area_in2 = recursive_face_area_in2(entity.definition.entities, transform, 0)
		(area_in2 * INCH2_TO_M2).round(6)
	rescue StandardError
		0
	end

	def recursive_face_area_in2(entities, transform, depth)
		return 0 if depth > 8

		total = 0.0
		entities.each do |child|
			if child.is_a?(Sketchup::Face)
				total += child.area(transform).to_f
				next
			end

			next unless child.is_a?(Sketchup::ComponentInstance) || child.is_a?(Sketchup::Group)
			next unless child.respond_to?(:definition) && child.definition

			child_transform = transform * child.transformation
			total += recursive_face_area_in2(child.definition.entities, child_transform, depth + 1)
		end

		total
	rescue StandardError
		0
	end

	def safe_entity_volume_m3(entity)
		return 0 unless entity.respond_to?(:volume)

		(entity.volume.to_f * INCH3_TO_M3).round(6)
	rescue StandardError
		0
	end

	def infer_ifc_type_from_tag(tag_name)
		key = tag_name.to_s.upcase
		return "IfcBeam" if key.include?("VIGA")
		return "IfcColumn" if key.include?("PILAR")
		return "IfcSlab" if key.include?("LAJE")
		return "IfcWall" if key.include?("PAREDE") || key.include?("ALVEN")
		return "IfcFooting" if key.include?("SAPATA") || key.include?("FUNDA")
		return "IfcStair" if key.include?("ESCADA")
		return "IfcDoor" if key.include?("PORTA")
		return "IfcWindow" if key.include?("JANELA")

		"IfcBuildingElementProxy"
	end

	def build_ifc_summary(rows)
		grouped = rows.group_by { |row| row[:ifc].to_s }
		physical = grouped.map do |ifc, list|
			{
				ifc: ifc,
				quantity: list.length,
				metro_linear_m: list.sum { |r| r[:metro_linear_total].to_f },
				area_m2: list.sum { |r| r[:area_total].to_f },
				volume_m3: list.sum { |r| r[:volume_total].to_f }
			}
		end

		storey_groups = rows.group_by { |row| row[:storey].to_s }
		storey_payload = storey_groups.map do |storey, storey_rows|
			by_ifc = storey_rows.group_by { |row| row[:ifc].to_s }
			{
				pavimento: storey,
				tipos: by_ifc.map do |ifc, list|
					{
						ifc: ifc,
						quantidade: list.length,
						metro_linear_m: list.sum { |r| r[:metro_linear_total].to_f },
						area_m2: list.sum { |r| r[:area_total].to_f },
						volume_m3: list.sum { |r| r[:volume_total].to_f }
					}
				end
			}
		end

		{
			physical_elements: physical,
			ifc_structure: [],
			other_types: [],
			por_pavimento: storey_payload,
			totals: {
				physical_elements: rows.length,
				ifc_structure: 0,
				other_types: 0,
				overall: rows.length
			},
			groups_count: physical.length
		}
	end

	unless file_loaded?(__FILE__)
		init_ui
		file_loaded(__FILE__)
	end
end
