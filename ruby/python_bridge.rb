require "open3"
require "fileutils"
require "time"

module RelatorioPRO
	module PythonBridge
		module_function

		def project_root
			File.expand_path("..", __dir__)
		end

		def python_executable
			ENV["RELATORIOPRO_PYTHON"] || "python"
		end

		def run_extract_ifc
			run_python_script("extract_ifc.py")
		end

		def run_grouping
			run_python_script("grouping.py")
		end

		def run_analytics
			run_python_script("analytics.py")
		end

		def run_full_pipeline
			steps = {
				extract_ifc: run_extract_ifc,
				grouping: run_grouping,
				analytics: run_analytics
			}

			success = steps.values.all? { |step| step[:success] }

			{
				success: success,
				steps: steps
			}
		end

		def logs_dir
			path = File.join(project_root, "logs")
			FileUtils.mkdir_p(path)
			path
		end

		def log_file
			File.join(logs_dir, "pipeline.log")
		end

		def run_python_script(script_name)
			script = File.join(project_root, "python", script_name)
			command = [python_executable, script]
			stdout, stderr, status = Open3.capture3(*command, chdir: project_root)

			puts stdout unless stdout.to_s.empty?
			puts stderr unless stderr.to_s.empty?

			result = {
				success: status.success?,
				stdout: stdout,
				stderr: stderr,
				exit_status: status.exitstatus,
				script: script_name,
				command: command.join(" ")
			}

			append_pipeline_log(result)
			result
		end

		def append_pipeline_log(result)
			File.open(log_file, "a") do |file|
				file.puts("[#{Time.now.iso8601}] script=#{result[:script]} success=#{result[:success]} exit_status=#{result[:exit_status]}")
				file.puts("command: #{result[:command]}")
				file.puts("stdout:\n#{result[:stdout]}") unless result[:stdout].to_s.empty?
				file.puts("stderr:\n#{result[:stderr]}") unless result[:stderr].to_s.empty?
				file.puts("-" * 80)
			end
		end
	end
end
