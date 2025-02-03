#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';
import { lithiaVersion } from 'lithia/meta';
import { ProjectTemplate } from 'lithia/types';
import {
  error,
  green,
  info,
  pingVersion,
  ready,
  runPromiseStep,
  validateProjectName,
} from 'lithia/utils';
import { exec } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prompts from 'prompts';

type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';
type CLIOptions = {
  name?: string;
  template?: string;
  'package-manager'?: string;
  yes?: boolean;
  install?: boolean;
  'no-install'?: boolean;
  overwrite?: boolean;
  git?: boolean;
  'no-git'?: boolean;
};

const TEMPLATES: ProjectTemplate[] = [
  {
    name: 'default',
    branch: 'main',
    url: 'https://github.com/lithiajs/lithia-default-app-template.git',
    description: 'Setup a Lithia.js app with no presets',
  },
  {
    name: 'with-drizzle',
    branch: 'main',
    url: 'https://github.com/lithiajs/lithia-with-drizzle-template.git',
    description: 'Setup a Lithia.js app using Drizzle ORM',
  },
  {
    name: 'with-prisma',
    branch: 'main',
    url: 'https://github.com/lithiajs/lithia-with-prisma-template.git',
    description: 'Setup a Lithia.js app using Prisma ORM',
  },
];

interface ProjectConfig {
  projectName: string;
  template: ProjectTemplate;
  packageManager?: PackageManager;
  installDependencies: boolean;
  initializeGit: boolean;
  overwrite?: boolean;
}

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
      const options = await validateAndParseArgs(args);
      const config = await getProjectConfig(options);
      await createProject(config);
      displaySuccessMessage(config);
    } catch (err) {
      error((err as Error).message);
      process.exit(1);
    }
  },
});

async function validateAndParseArgs(args: CLIOptions) {
  if (args.yes && !args.name) {
    throw new Error('Project name is required when using --yes flag');
  }

  if (args.template && !TEMPLATES.some((t) => t.name === args.template)) {
    throw new Error(`Invalid template: ${args.template}`);
  }

  if (
    args['package-manager'] &&
    !isValidPackageManager(args['package-manager'])
  ) {
    throw new Error(`Invalid package manager: ${args['package-manager']}`);
  }

  if (args.install && args['no-install']) {
    throw new Error('Cannot use both --install and --no-install');
  }

  if (args.git && args['no-git']) {
    throw new Error('Cannot use both --git and --no-git');
  }

  return args;
}

async function getProjectConfig(options: CLIOptions): Promise<ProjectConfig> {
  const checks = await checkSystemDependencies();
  const baseConfig = await getBaseConfig(options);

  return options.yes
    ? getAutoConfig(options, checks, baseConfig)
    : getInteractiveConfig(options, checks, baseConfig);
}

async function checkSystemDependencies() {
  const [npm, yarn, pnpm, bun, git] = await Promise.all([
    pingVersion('npm'),
    pingVersion('yarn'),
    pingVersion('pnpm'),
    pingVersion('bun'),
    pingVersion('git'),
  ]);

  return { npm, yarn, pnpm, bun, git };
}

async function getBaseConfig(options: CLIOptions) {
  const projectName = options.name || (await getProjectName());
  validateProjectName(projectName);

  return {
    projectName,
    template:
      TEMPLATES.find((t) => t.name === options.template) || TEMPLATES[0],
    installDependencies: getInstallFlag(options),
    initializeGit: getGitFlag(options),
    packageManager: options['package-manager'] as PackageManager,
  };
}

async function getProjectName(): Promise<string> {
  const { name } = await prompts({
    type: 'text',
    name: 'name',
    message: `What is the ${green('name')} of your project?`,
    initial: 'my-lithia-app',
    validate: validateProjectName,
    format: (v: string) => v.trim(),
  });
  return name;
}

function getInstallFlag(options: CLIOptions): boolean {
  if (options.install) return true;
  if (options['no-install']) return false;
  return true;
}

function getGitFlag(options: CLIOptions): boolean {
  if (options.git) return true;
  if (options['no-git']) return false;
  return true;
}

async function getAutoConfig(
  options: CLIOptions,
  checks: Record<string, boolean>,
  baseConfig: Partial<ProjectConfig>,
): Promise<ProjectConfig> {
  if (options['package-manager'] && !checks[options['package-manager']]) {
    throw new Error(
      `Package manager ${options['package-manager']} not available`,
    );
  }

  return {
    ...baseConfig,
    packageManager: (options['package-manager'] as PackageManager) || 'npm',
    installDependencies: !options['no-install'],
    initializeGit: options.git ?? !options['no-git'],
    overwrite: options.overwrite,
  } as ProjectConfig;
}

async function getInteractiveConfig(
  options: CLIOptions,
  checks: Record<string, boolean>,
  baseConfig: Partial<ProjectConfig>,
): Promise<ProjectConfig> {
  const responses = await prompts(
    [
      {
        name: 'template',
        type: options.template ? null : 'select',
        message: `Choose a ${green('template')}`,
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
        choices: getAvailablePackageManagers(checks),
      },
      {
        name: 'initializeGit',
        type: checks.git && options.git === undefined ? 'confirm' : null,
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

function getAvailablePackageManagers(checks: Record<string, boolean>) {
  return [
    { title: 'npm', value: 'npm', disabled: !checks.npm },
    { title: 'yarn', value: 'yarn', disabled: !checks.yarn },
    { title: 'pnpm', value: 'pnpm', disabled: !checks.pnpm },
    { title: 'bun', value: 'bun', disabled: !checks.bun },
  ];
}

async function createProject(config: ProjectConfig) {
  const dir = path.resolve(process.cwd(), config.projectName);

  await handleExistingDirectory(dir, config);
  await cloneTemplate(dir, config.template);
  await updatePackageJson(dir, config.projectName);
  await rm(path.join(dir, '.git'), { recursive: true });
  await rm(path.join(dir, 'package-lock.json'), { recursive: true });

  if (config.initializeGit) {
    await initializeGitRepository(dir);
  }

  if (config.installDependencies && config.packageManager) {
    await installDependencies(dir, config.packageManager);
  }
}

async function handleExistingDirectory(dir: string, config: ProjectConfig) {
  const dirExists = await stat(dir).catch(() => null);

  if (dirExists) {
    if (!config.overwrite) {
      const { overwrite } = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: `Directory ${green(dir)} exists. Overwrite?`,
        initial: false,
      });

      if (!overwrite) process.exit(0);
    }
    await rm(dir, { recursive: true });
  }

  await mkdir(dir, { recursive: true });
}

async function cloneTemplate(dir: string, template: ProjectTemplate) {
  await runPromiseStep(
    () =>
      executeCommand(
        `git clone --branch ${template.branch} ${template.url} .`,
        dir,
      ),
    'Cloning template...',
  );
}

async function updatePackageJson(dir: string, projectName: string) {
  await runPromiseStep(async () => {
    const pkgPath = path.join(dir, 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));

    pkg.name = projectName;
    pkg.version = '0.1.0';
    delete pkg.description;

    await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
  }, 'Updating package.json...');
}

async function initializeGitRepository(dir: string) {
  await runPromiseStep(
    () => executeCommand('git init', dir),
    'Initializing git...',
  );
}

async function installDependencies(dir: string, manager: PackageManager) {
  await runPromiseStep(
    () => executeCommand(`${manager} install`, dir),
    'Installing dependencies...',
  );
}

function executeCommand(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (err) => (err ? reject(err) : resolve()));
  });
}

function displaySuccessMessage(config: ProjectConfig) {
  ready('Project ready!');
  const commands = [
    `cd ${config.projectName}`,
    config.installDependencies
      ? `${config.packageManager} run dev`
      : 'npm install && npm run dev',
  ];

  info('Next steps:');
  commands.forEach((cmd, i) =>
    info(`${i === commands.length - 1 ? '└──' : '├──'} ${green(cmd)}`),
  );
}

function isValidPackageManager(manager: string): manager is PackageManager {
  return ['npm', 'yarn', 'pnpm', 'bun'].includes(manager);
}

runMain(main);
