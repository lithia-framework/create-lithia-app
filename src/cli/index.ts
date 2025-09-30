#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';
import { exec } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prompts from 'prompts';

// Constants
const PACKAGE_MANAGERS = ['npm', 'yarn', 'pnpm', 'bun'] as const;
const DEFAULT_PROJECT_NAME = 'my-lithia-app';
const DEFAULT_PACKAGE_MANAGER = 'npm';
const INITIAL_VERSION = '0.1.0';

// Error messages
const ERROR_MESSAGES = {
  PROJECT_NAME_REQUIRED: 'Project name is required when using --yes flag',
  INVALID_TEMPLATE: (template: string) => `Invalid template: ${template}`,
  INVALID_PACKAGE_MANAGER: (manager: string) =>
    `Invalid package manager: ${manager}`,
  CONFLICTING_INSTALL_FLAGS: 'Cannot use both --install and --no-install',
  CONFLICTING_GIT_FLAGS: 'Cannot use both --git and --no-git',
  PACKAGE_MANAGER_NOT_AVAILABLE: (manager: string) =>
    `Package manager ${manager} not available`,
  PROJECT_NAME_EMPTY: 'Project name cannot be empty',
  PROJECT_NAME_INVALID:
    'Project name can only contain lowercase letters, numbers, and hyphens',
} as const;

// Colors
const colors = {
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  green: (s: string) => `\x1b[32m${s}\x1b[39m`,
  red: (s: string) => `\x1b[31m${s}\x1b[39m`,
  white: (s: string) => `\x1b[37m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
} as const;

// Types
type LogLevel = 'wait' | 'error' | 'warn' | 'ready' | 'info' | 'event';
type PackageManager = (typeof PACKAGE_MANAGERS)[number];

interface ProjectTemplate {
  name: string;
  branch: string;
  url: string;
  description: string;
}

interface ProjectConfig {
  projectName: string;
  template: ProjectTemplate;
  packageManager?: PackageManager;
  installDependencies: boolean;
  initializeGit: boolean;
  overwrite?: boolean;
}

interface CLIOptions {
  name?: string;
  template?: string;
  'package-manager'?: string;
  yes?: boolean;
  install?: boolean;
  'no-install'?: boolean;
  overwrite?: boolean;
  git?: boolean;
  'no-git'?: boolean;
}

interface SystemDependencies {
  npm: boolean;
  yarn: boolean;
  pnpm: boolean;
  bun: boolean;
  git: boolean;
}

// Logging system
class Logger {
  private static readonly prefixes = {
    wait: colors.white(colors.bold('○')),
    error: colors.red(colors.bold('⨯')),
    warn: colors.yellow(colors.bold('⚠')),
    ready: '▲',
    info: colors.white(colors.bold(' ')),
    event: colors.green(colors.bold('✓')),
  } as const;

  private static log(level: LogLevel, ...message: unknown[]): void {
    if (
      (message[0] === '' || message[0] === undefined) &&
      message.length === 1
    ) {
      message.shift();
    }

    const consoleMethod: 'log' | 'warn' | 'error' =
      level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';

    const prefix = this.prefixes[level];

    if (message.length === 0) {
      console[consoleMethod]('');
    } else if (message.length === 1 && typeof message[0] === 'string') {
      console[consoleMethod](' ' + prefix + ' ' + message[0]);
    } else {
      console[consoleMethod](' ' + prefix, ...message);
    }
  }

  static error(...message: unknown[]): void {
    this.log('error', ...message);
  }

  static info(...message: unknown[]): void {
    this.log('info', ...message);
  }

  static ready(...message: unknown[]): void {
    this.log('ready', ...message);
  }

  static wait(...message: unknown[]): void {
    this.log('wait', ...message);
  }

  static event(...message: unknown[]): void {
    this.log('event', ...message);
  }
}

// Custom error classes
class CLIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CLIError';
  }
}

class ValidationError extends CLIError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Utility functions
class Validators {
  static validateProjectName(value: string): string | boolean {
    if (!value) return ERROR_MESSAGES.PROJECT_NAME_EMPTY;
    return /^[a-z0-9-]+$/.test(value)
      ? true
      : ERROR_MESSAGES.PROJECT_NAME_INVALID;
  }

  static isValidPackageManager(manager: string): manager is PackageManager {
    return PACKAGE_MANAGERS.includes(manager as PackageManager);
  }
}

class SystemChecker {
  static async checkCommand(command: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      exec(`${command} --version`, (error) => {
        resolve(!error);
      });
    });
  }

  static async checkAllDependencies(): Promise<SystemDependencies> {
    const [npm, yarn, pnpm, bun, git] = await Promise.all([
      this.checkCommand('npm'),
      this.checkCommand('yarn'),
      this.checkCommand('pnpm'),
      this.checkCommand('bun'),
      this.checkCommand('git'),
    ]);

    return { npm, yarn, pnpm, bun, git };
  }
}

class TaskRunner {
  static async run<T>(fn: () => Promise<T>, message: string): Promise<T> {
    const time = Date.now();
    Logger.wait(message);
    const result = await fn();
    Logger.event(`Done in ${Date.now() - time}ms\n`);
    return result;
  }
}

// Get version from package.json
let lithiaVersion: string;
try {
  const packageJson = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf-8'),
  );
  lithiaVersion = packageJson.version;
} catch {
  throw new CLIError('Failed to read package.json');
}

// Templates configuration
const TEMPLATES: ProjectTemplate[] = [
  {
    name: 'default',
    branch: 'v4.0.1',
    url: 'https://github.com/lithia-framework/lithia-default-app-template',
    description: 'Setup a Lithia.js app with no presets',
  },
];

// Configuration classes
class ConfigValidator {
  static validateArgs(args: CLIOptions): void {
    if (args.yes && !args.name) {
      throw new ValidationError(ERROR_MESSAGES.PROJECT_NAME_REQUIRED);
    }

    if (args.template && !TEMPLATES.some((t) => t.name === args.template)) {
      throw new ValidationError(ERROR_MESSAGES.INVALID_TEMPLATE(args.template));
    }

    if (
      args['package-manager'] &&
      !Validators.isValidPackageManager(args['package-manager'])
    ) {
      throw new ValidationError(
        ERROR_MESSAGES.INVALID_PACKAGE_MANAGER(args['package-manager']),
      );
    }

    if (args.install && args['no-install']) {
      throw new ValidationError(ERROR_MESSAGES.CONFLICTING_INSTALL_FLAGS);
    }

    if (args.git && args['no-git']) {
      throw new ValidationError(ERROR_MESSAGES.CONFLICTING_GIT_FLAGS);
    }
  }
}

class ConfigBuilder {
  static async buildProjectConfig(options: CLIOptions): Promise<ProjectConfig> {
    const dependencies = await SystemChecker.checkAllDependencies();
    const baseConfig = await this.getBaseConfig(options);

    return options.yes
      ? this.getAutoConfig(options, dependencies, baseConfig)
      : this.getInteractiveConfig(options, dependencies, baseConfig);
  }

  private static async getBaseConfig(options: CLIOptions) {
    const projectName = options.name || (await this.getProjectName());
    const validation = Validators.validateProjectName(projectName);
    if (validation !== true) {
      throw new ValidationError(validation as string);
    }

    return {
      projectName,
      template:
        TEMPLATES.find((t) => t.name === options.template) || TEMPLATES[0],
      installDependencies: this.getInstallFlag(options),
      initializeGit: this.getGitFlag(options),
      packageManager: options['package-manager'] as PackageManager,
    };
  }

  private static async getProjectName(): Promise<string> {
    const { name } = await prompts({
      type: 'text',
      name: 'name',
      message: `What is the ${colors.green('name')} of your project?`,
      initial: DEFAULT_PROJECT_NAME,
      validate: Validators.validateProjectName,
      format: (v: string) => v.trim(),
    });
    return name;
  }

  private static getInstallFlag(options: CLIOptions): boolean {
    if (options.install) return true;
    if (options['no-install']) return false;
    return true;
  }

  private static getGitFlag(options: CLIOptions): boolean {
    if (options.git) return true;
    if (options['no-git']) return false;
    return true;
  }

  private static getAutoConfig(
    options: CLIOptions,
    dependencies: SystemDependencies,
    baseConfig: Partial<ProjectConfig>,
  ): ProjectConfig {
    if (
      options['package-manager'] &&
      !dependencies[options['package-manager'] as keyof SystemDependencies]
    ) {
      throw new ValidationError(
        ERROR_MESSAGES.PACKAGE_MANAGER_NOT_AVAILABLE(
          options['package-manager'],
        ),
      );
    }

    return {
      ...baseConfig,
      packageManager:
        (options['package-manager'] as PackageManager) ||
        DEFAULT_PACKAGE_MANAGER,
      installDependencies: !options['no-install'],
      initializeGit: options.git ?? !options['no-git'],
      overwrite: options.overwrite,
    } as ProjectConfig;
  }

  private static async getInteractiveConfig(
    options: CLIOptions,
    dependencies: SystemDependencies,
    baseConfig: Partial<ProjectConfig>,
  ): Promise<ProjectConfig> {
    const responses = await prompts(
      [
        {
          name: 'template',
          type: options.template ? null : 'select',
          message: `Choose a ${colors.green('template')}`,
          choices: TEMPLATES.map((t) => ({
            title: t.name,
            value: t,
            description: t.description,
          })),
        },
        {
          name: 'installDependencies',
          type: options.install === undefined ? 'confirm' : null,
          message: `Install dependencies?`,
          initial: true,
        },
        {
          name: 'packageManager',
          type: (prev: boolean) =>
            (prev || options.install) && !options['package-manager']
              ? 'select'
              : null,
          message: `Choose package manager`,
          choices: this.getAvailablePackageManagers(dependencies),
        },
        {
          name: 'initializeGit',
          type:
            dependencies.git && options.git === undefined ? 'confirm' : null,
          message: `Initialize git repository?`,
          initial: true,
        },
      ],
      { onCancel: () => process.exit(0) },
    );

    return {
      ...baseConfig,
      ...responses,
      initializeGit: responses.initializeGit ?? baseConfig.initializeGit,
    } as ProjectConfig;
  }

  private static getAvailablePackageManagers(dependencies: SystemDependencies) {
    return PACKAGE_MANAGERS.map((manager) => ({
      title: manager,
      value: manager,
      disabled: !dependencies[manager],
    }));
  }
}

// Project creation classes
class ProjectCreator {
  static async createProject(config: ProjectConfig): Promise<void> {
    const dir = path.resolve(process.cwd(), config.projectName);

    await this.handleExistingDirectory(dir, config);
    await this.cloneTemplate(dir, config.template);
    await this.updatePackageJson(dir, config.projectName);
    await rm(path.join(dir, '.git'), { recursive: true });

    if (config.initializeGit) {
      await this.initializeGitRepository(dir);
    }

    if (config.installDependencies && config.packageManager) {
      await this.installDependencies(dir, config.packageManager);
    }
  }

  private static async handleExistingDirectory(
    dir: string,
    config: ProjectConfig,
  ): Promise<void> {
    const dirExists = await stat(dir).catch(() => null);

    if (dirExists) {
      if (!config.overwrite) {
        const { overwrite } = await prompts({
          type: 'confirm',
          name: 'overwrite',
          message: `Directory ${colors.green(dir)} exists. Overwrite?`,
          initial: false,
        });

        if (!overwrite) process.exit(0);
      }
      await rm(dir, { recursive: true });
    }

    await mkdir(dir, { recursive: true });
  }

  private static async cloneTemplate(
    dir: string,
    template: ProjectTemplate,
  ): Promise<void> {
    await TaskRunner.run(
      () =>
        this.executeCommand(
          `git clone --branch ${template.branch} ${template.url} .`,
          dir,
        ),
      'Cloning template...',
    );
  }

  private static async updatePackageJson(
    dir: string,
    projectName: string,
  ): Promise<void> {
    await TaskRunner.run(async () => {
      const pkgPath = path.join(dir, 'package.json');
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));

      pkg.name = projectName;
      pkg.version = INITIAL_VERSION;
      delete pkg.description;

      await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
    }, 'Updating package.json...');
  }

  private static async initializeGitRepository(dir: string): Promise<void> {
    await TaskRunner.run(
      () => this.executeCommand('git init', dir),
      'Initializing git...',
    );
  }

  private static async installDependencies(
    dir: string,
    manager: PackageManager,
  ): Promise<void> {
    await TaskRunner.run(
      () => this.executeCommand(`${manager} install`, dir),
      'Installing dependencies...',
    );
  }

  private static executeCommand(command: string, cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(command, { cwd }, (err) => (err ? reject(err) : resolve()));
    });
  }
}

class SuccessDisplay {
  static displaySuccessMessage(config: ProjectConfig): void {
    Logger.ready('Project ready!');
    const commands = [
      `cd ${config.projectName}`,
      config.installDependencies
        ? `${config.packageManager} run dev`
        : 'npm install && npm run dev',
    ];

    Logger.info('Next steps:');
    commands.forEach((cmd, i) =>
      Logger.info(
        `${i === commands.length - 1 ? '└──' : '├──'} ${colors.green(cmd)}`,
      ),
    );
  }
}

// Main CLI command
const main = defineCommand({
  meta: {
    name: 'create-lithia-app',
    description: 'Create a new Lithia app',
    version: lithiaVersion,
  },
  args: {
    name: {
      type: 'string',
      description: 'Project name',
    },
    template: {
      type: 'string',
      description: 'Project template to use',
    },
    'package-manager': {
      type: 'string',
      description: 'Preferred package manager (npm, yarn, pnpm, bun)',
    },
    yes: {
      type: 'boolean',
      alias: 'y',
      description: 'Skip all prompts',
    },
    install: {
      type: 'boolean',
      description: 'Install dependencies',
    },
    'no-install': {
      type: 'boolean',
      description: 'Skip dependency installation',
    },
    overwrite: {
      type: 'boolean',
      description: 'Overwrite existing directory',
    },
    git: {
      type: 'boolean',
      description: 'Initialize git repository',
    },
    'no-git': {
      type: 'boolean',
      description: 'Skip git initialization',
    },
  },
  async run({ args }) {
    try {
      ConfigValidator.validateArgs(args);
      const config = await ConfigBuilder.buildProjectConfig(args);
      await ProjectCreator.createProject(config);
      SuccessDisplay.displaySuccessMessage(config);
    } catch (err) {
      if (err instanceof CLIError) {
        Logger.error(err.message);
      } else {
        Logger.error('An unexpected error occurred:', err);
      }
      process.exit(1);
    }
  },
});

runMain(main);
