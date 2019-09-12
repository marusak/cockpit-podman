/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

import React from 'react';
import { ToastNotificationList, ToastNotification } from 'patternfly-react';

import cockpit from 'cockpit';
import ContainerHeader from './ContainerHeader.jsx';
import Containers from './Containers.jsx';
import Images from './Images.jsx';
import * as utils from './util.js';

const _ = cockpit.gettext;
const permission = cockpit.permission({ admin: true });

class Application extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            rootServiceAvailable: null,
            userServiceAvailable: null,
            enableService: true,
            images: null,
            userImagesLoaded: false,
            rootImagesLoaded: false,
            containers: null,
            containersStats: {},
            userContainersLoaded: null,
            rootContainersLoaded: null,
            userServiceExists: false,
            onlyShowRunning: true,
            textFilter: "",
            dropDownValue: 'Everything',
            notifications: [],
        };
        this.onAddNotification = this.onAddNotification.bind(this);
        this.updateState = this.updateState.bind(this);
        this.onDismissNotification = this.onDismissNotification.bind(this);
        this.onChange = this.onChange.bind(this);
        this.onFilterChanged = this.onFilterChanged.bind(this);
        this.updateImagesAfterEvent = this.updateImagesAfterEvent.bind(this);
        this.updateContainerAfterEvent = this.updateContainerAfterEvent.bind(this);
        this.updateContainerStats = this.updateContainerStats.bind(this);
        this.startService = this.startService.bind(this);
        this.showAll = this.showAll.bind(this);
        this.goToServicePage = this.goToServicePage.bind(this);
        this.handleImageEvent = this.handleImageEvent.bind(this);
        this.handleSystemEvent = this.handleSystemEvent.bind(this);
        this.handleContainerEvent = this.handleContainerEvent.bind(this);
        this.checkUserService = this.checkUserService.bind(this);
    }

    onAddNotification(notification) {
        notification.index = this.state.notifications.length;

        this.setState({
            notifications: [
                ...this.state.notifications,
                notification
            ]
        });
    }

    onDismissNotification(notificationIndex) {
        let notificationsArray = this.state.notifications.concat();
        let index = notificationsArray.findIndex(current => current.index == notificationIndex);

        if (index !== -1) {
            notificationsArray.splice(index, 1);
            this.setState({ notifications: notificationsArray });
        }
    }

    onChange(value) {
        this.setState({
            onlyShowRunning: value != "all"
        });
    }

    onFilterChanged(value) {
        this.setState({
            textFilter: value
        });
    }

    updateState(state, id, newValue) {
        this.setState(prevState => {
            let copyState = Object.assign({}, prevState[state]);

            copyState[id] = newValue;

            return {
                [state]: copyState,
            };
        });
    }

    updateContainerStats(id, root) {
        utils.podmanAction("GetContainerStats", { name: id }, root)
                .then(reply => {
                    this.updateState("containersStats", reply.container.id + root.toString(), reply.container);
                })
                .catch(ex => {
                    if (ex.error === "io.podman.ErrRequiresCgroupsV2ForRootless") {
                        console.log("This OS does not support CgroupsV2. Some information may be missing.");
                        this.updateState("containersStats", id + root.toString(), -1);
                    } else
                        console.warn("Failed to update container stats:", JSON.stringify(ex));
                });
    }

    updateContainersAfterEvent(root) {
        utils.podmanAction("ListContainers", {}, root)
                .then(reply => {
                    this.setState(prevState => {
                        // Copy only containers that could not be deleted with this event
                        // So when event from root come, only copy user containers and vice versa
                        let copyContainers = {};
                        Object.entries(prevState.containers || {}).forEach(([id, container]) => {
                            if (container.isRoot !== root)
                                copyContainers[id] = container;
                        });
                        for (let container of reply.containers || []) {
                            container.isRoot = root;
                            copyContainers[container.id + root.toString()] = container;
                            if (container.status === "running")
                                this.updateContainerStats(container.id, root);
                        }

                        return {
                            containers: copyContainers,
                            [root ? "rootContainersLoaded" : "userContainersLoaded"]: true,
                        };
                    });
                })
                .catch(e => console.log(e));
    }

    updateImagesAfterEvent(root) {
        utils.updateImages(root)
                .then(reply => {
                    this.setState(prevState => {
                        // Copy only images that could not be deleted with this event
                        // So when event from root come, only copy user images and vice versa
                        let copyImages = {};
                        Object.entries(prevState.images || {}).forEach(([id, image]) => {
                            if (image.isRoot !== root)
                                copyImages[id] = image;
                        });
                        Object.entries(reply).forEach(([id, image]) => {
                            image.isRoot = root;
                            copyImages[id + root.toString()] = image;
                        });

                        return {
                            images: copyImages,
                            [root ? "rootImagesLoaded" : "userImagesLoaded"]: true
                        };
                    });
                })
                .catch(ex => {
                    console.warn("Failed to do Update Images:", JSON.stringify(ex));
                });
    }

    updateContainerAfterEvent(id, root) {
        utils.podmanAction("GetContainer", { id: id }, root)
                .then(reply => {
                    reply.container.isRoot = root;
                    this.updateState("containers", reply.container.id + root.toString(), reply.container);
                    if (reply.container.status == "running")
                        this.updateContainerStats(reply.container.id, root);
                    else {
                        this.setState(prevState => {
                            let copyStats = Object.assign({}, prevState.containersStats);
                            delete copyStats[reply.container.id + root.toString()];
                            return { containersStats: copyStats };
                        });
                    }
                })
                .catch(e => console.log(e));
    }

    updateImageAfterEvent(id, root) {
        utils.updateImage(id, root)
                .then(reply => {
                    reply.image.isRoot = root;
                    this.updateState("images", reply.image.id + root.toString(), reply.image);
                })
                .catch(ex => {
                    console.warn("Failed to do Update Image:", JSON.stringify(ex));
                });
    }

    handleSystemEvent(event, root) {
        switch (event.status) {
        case 'refresh':
            this.updateImagesAfterEvent(root);
            this.updateContainersAfterEvent(root);
            break;
        default:
            console.warn('Unhandled event type ', event.type, event.status);
        }
    }

    handleImageEvent(event, root) {
        switch (event.status) {
        case 'push':
        case 'save':
        case 'tag':
            this.updateImageAfterEvent(event.id, root);
            break;
        case 'pull': // Pull event has not event.id
        case 'untag':
        case 'remove':
        case 'prune':
            this.updateImagesAfterEvent(root);
            break;
        default:
            console.warn('Unhandled event type ', event.type, event.status);
        }
    }

    handleContainerEvent(event, root) {
        switch (event.status) {
        /* The following events do not need to trigger any state updates */
        case 'attach':
        case 'exec':
        case 'export':
        case 'import':
        case 'init':
        case 'wait':
        case 'restart': // We get seperate died-init-start events after the restart event
            break;
        /* The following events need only to update the Container list
         * We do get the container affected in the event object but for
         * now we 'll do a batch update
         */
        case 'checkpoint':
        case 'create':
        case 'died':
        case 'kill':
        case 'mount':
        case 'pause':
        case 'prune':
        case 'restore':
        case 'start':
        case 'stop':
        case 'sync':
        case 'unmount':
        case 'unpause':
            this.updateContainerAfterEvent(event.id, root);
            break;
        case 'remove':
        case 'cleanup':
            this.updateContainersAfterEvent(root);
            break;
        /* The following events need only to update the Image list */
        case 'commit':
            this.updateImagesAfterEvent(root);
            break;
        default:
            console.warn('Unhandled event type ', event.type, event.status);
        }
    }

    handleEvent(event, root) {
        switch (event.type) {
        case 'container':
            this.handleContainerEvent(event, root);
            break;
        case 'image':
            this.handleImageEvent(event, root);
            break;
        case 'system':
            this.handleSystemEvent(event, root);
            break;
        default:
            console.warn('Unhandled event type ', event.type);
        }
    }

    init(root) {
        this.checkUserService();
        utils.podmanAction("GetVersion", {}, root)
                .then(reply => {
                    this.setState({ [root ? "rootServiceAvailable" : "userServiceAvailable"]: true });
                    this.updateImagesAfterEvent(root);
                    this.updateContainersAfterEvent(root);
                    utils.monitor("GetEvents", {},
                                  message => {
                                      message.parameters && message.parameters.events && this.handleEvent(message.parameters.events, root);
                                  },
                                  root
                    );
                })
                .catch(error => {
                    if (error.name === "ConnectionClosed") {
                        this.setState({ [root ? "rootServiceAvailable" : "userServiceAvailable"]: false,
                                        [root ? "rootContainersLoaded" : "userContainersLoaded"]: true,
                                        [root ? "rootImagesLoaded" : "userImagesLoaded"]: true
                        });
                    } else
                        console.error("Failed to call GetVersion():", error);
                });
    }

    componentDidMount() {
        this.init(true);
        this.init(false);
    }

    checkUserService() {
        let argv = ["systemctl", "--user", "status", "io.podman.socket"];

        cockpit.spawn(argv)
                .then(() => this.setState({ userServiceExists: true }))
                .catch(err => {
                    if (err.exit_status === 4) // systemctl status returns 3 when service is not running
                        this.setState({ userServiceExists: false });
                    else
                        this.setState({ userServiceExists: true });
                });
    }

    startService(e) {
        if (!e || e.button !== 0)
            return;

        let argv;
        if (this.state.enableService)
            argv = ["systemctl", "enable", "--now", "io.podman.socket"];
        else
            argv = ["systemctl", "start", "io.podman.socket"];

        cockpit.spawn(argv, { superuser: "require", err: "message" })
                .then(() => this.init(true))
                .catch(err => {
                    this.setState({ rootServiceAvailable: false,
                                    rootContainersLoaded: true,
                                    rootImagesLoaded: true });
                    console.warn("Failed to start root io.podman.socket:", JSON.stringify(err));
                });

        if (this.state.enableService)
            argv = ["systemctl", "--user", "enable", "--now", "io.podman.socket"];
        else
            argv = ["systemctl", "--user", "start", "io.podman.socket"];

        cockpit.spawn(argv, { err: "message" })
                .then(() => this.init(false))
                .catch(err => {
                    this.setState({ userServiceAvailable: false,
                                    userContainersLoaded: true,
                                    userImagesLoaded: true });
                    console.warn("Failed to start user io.podman.socket:", JSON.stringify(err));
                });
    }

    showAll() {
        this.setState({ onlyShowRunning: false });
    }

    goToServicePage(e) {
        if (!e || e.button !== 0)
            return;
        cockpit.jump("/system/services#/io.podman.socket");
    }

    render() {
        if (this.state.rootServiceAvailable === null && this.state.userServiceAvailable === null) // not detected yet
            return null;

        if (!this.state.rootServiceAvailable && !this.state.userServiceAvailable) {
            return (
                <div className="curtains-ct blank-slate-pf">
                    <div className="blank-slate-pf-icon">
                        <span className="fa fa-exclamation-circle" />
                    </div>
                    <h1 className="header" id="slate-header">
                        { _("Podman Service is Not Active") }
                    </h1>
                    <div className="checkbox">
                        <label>
                            <input type="checkbox"
                                   checked={this.state.enableService}
                                   onChange={ e => this.setState({ enableService: e.target.checked }) } />
                            {_("Automatically start podman on boot")}
                        </label>
                    </div>

                    <div className="blank-slate-pf-main-action">
                        <button className="btn btn-primary btn-lg"
                                onClick={this.startService}>
                            {_("Start podman")}
                        </button>
                    </div>
                    <div className="blank-slate-pf-secondary-action">
                        <button className="btn btn-default"
                                onClick={this.goToServicePage}>
                            {_("Troubleshoot")}
                        </button>
                    </div>
                </div>);
        }

        let imageContainerList = {};
        if (this.state.containers !== null) {
            Object.keys(this.state.containers).forEach(c => {
                const container = this.state.containers[c];
                const image = container.imageid + container.isRoot.toString();
                if (imageContainerList[image]) {
                    imageContainerList[image].push({
                        container: container,
                        stats: this.state.containersStats[container.id + container.isRoot.toString()],
                    });
                } else {
                    imageContainerList[image] = [ {
                        container: container,
                        stats: this.state.containersStats[container.id + container.isRoot.toString()]
                    } ];
                }
            });
        } else
            imageContainerList = null;

        let startService = "";
        if (!this.state.rootServiceAvailable && permission.allowed) {
            startService = <div className="alert alert-danger dialog-error">
                <div className="info-message">
                    <span className="pficon pficon-info" />
                    <span>{_("System Podman service is also available")}</span>
                </div>
                <button onClick={this.startService}>{_("Start")}</button>
            </div>;
        }
        if (!this.state.userServiceAvailable && this.state.userServiceExists) {
            startService = <div className="alert alert-info dialog-info">
                <div className="info-message">
                    <span className="fa fa-exclamation-triangle" />
                    <span>{_("User Podman service is also available")}</span>
                </div>
                <button onClick={this.startService}>{_("Start")}</button>
            </div>;
        }

        const imageList =
            <Images
                key={_("imageList")}
                images={this.state.rootImagesLoaded && this.state.userImagesLoaded ? this.state.images : null}
                imageContainerList={imageContainerList}
                onAddNotification={this.onAddNotification}
                textFilter={this.state.textFilter}
                showAll={this.showAll}
                user={permission.user || _("user")}
            />;
        const containerList =
            <Containers
                key={_("containerList")}
                containers={this.state.rootContainersLoaded && this.state.userContainersLoaded ? this.state.containers : null}
                containersStats={this.state.containersStats}
                onlyShowRunning={this.state.onlyShowRunning}
                textFilter={this.state.textFilter}
                user={permission.user || _("user")}
            />;
        const notificationList = (
            <ToastNotificationList>
                {this.state.notifications.map((notification, index) => {
                    return (
                        <ToastNotification key={index} type={notification.type}
                                           onDismiss={() => this.onDismissNotification(notification.index)}>
                            {notification.children}
                        </ToastNotification>
                    );
                })}
            </ToastNotificationList>
        );

        return (
            <div id="overview" key={"overview"}>
                <div key={"containerheader"} className="content-filter">
                    <ContainerHeader
                        onlyShowRunning={this.state.onlyShowRunning}
                        onChange={this.onChange}
                        onFilterChanged={this.onFilterChanged}
                    />
                </div>
                { startService }
                <div key={"containerslists"} className="container-fluid">
                    {containerList}
                </div>
                <div key={"imageslists"} className="container-fluid">
                    {imageList}
                </div>
                <div style={null}>
                    {notificationList}
                </div>
            </div>
        );
    }
}

export default Application;
