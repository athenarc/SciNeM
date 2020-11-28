import React from 'react';
import { Button, Col, Input, Modal, ModalBody, ModalFooter, ModalHeader, Row } from 'reactstrap';

import './entity-box.css';
import { generateGroupsOfDisjunctions } from 'app/shared/util/constraint-utils';
import ConstraintItem from 'app/modules/constraints/constraint-item';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

class EntityBox extends React.Component<any, any> {
    constructor(props) {
        super(props);
        this.state = {
            referenceKeyModal: false,
            constraintsModal: false
        };
    }

    toggleReferenceKeyModal() {
        this.setState({
            referenceKeyModal: !this.state.referenceKeyModal
        });
    }

    toggleConstraintsModal() {
        this.setState({
            constraintsModal: !this.state.constraintsModal
        });
    }

    numberOfConditions() {
        if (this.props.constraints) {
            const conditionsReducer = (setConditions, currentCondition) => {
                return (currentCondition.value && currentCondition.index !== 0) ? setConditions + 1 : setConditions;
            };
            const fieldsReducer = (constrainedFieldConditions, currentFieldConstraints) => {
                return (currentFieldConstraints.enabled) ? constrainedFieldConditions + currentFieldConstraints.conditions.reduce(conditionsReducer, 0) : constrainedFieldConditions;
            };
            return Object.values(this.props.constraints).reduce(fieldsReducer, 0);
        } else {
            return 0;
        }
    }

    numberOfConstraints() {
        if (this.props.constraints) {
            const fieldsReducer = (constrainedFields, currentField) => {
                return (currentField.enabled && currentField.conditions.some(condition => (condition.value && condition.index !== 0))) ? constrainedFields + 1 : constrainedFields;
            };
            return Object.values(this.props.constraints).reduce(fieldsReducer, 0);
        } else {
            return 0;
        }
    }

    constraintSummary() {
        if (this.props.constraints) {
            console.log(this.props.constraints);
            const entityDisjunctions = generateGroupsOfDisjunctions(this.props.constraints);
            const entityExpressions = entityDisjunctions.map(fieldDisjunctions => {
                const fieldExpressions = fieldDisjunctions.map(disjunction => {
                    if (disjunction.length > 1) {
                        const subconjuctions = disjunction.map(conjunctionMember => {
                            return conjunctionMember.field + conjunctionMember.condition;
                        });
                        if (fieldDisjunctions.length>1) {
                            return `(${subconjuctions.join(' and ')})`;
                        } else {
                            return `${subconjuctions.join(' and ')}`;
                        }
                    } else {
                        return disjunction[0].field + disjunction[0].condition;
                    }
                });
                return fieldExpressions.join(' or ');
            });
            return entityExpressions.filter(ex=>!!ex).join(', ');
        }
        return '';
    }

    render() {
        return (
            <div className="position-relative entity-box">
                <div>
                    <Button color="dark" size="lg" className={'text-nowrap'}
                            disabled>{this.props.idIndexedSchema[this.props.entity]}</Button>
                </div>
                <div className="position-absolute ">
                    {
                        this.props.primaryEntity &&
                        <div className={'d-inline-block'}>
                            <Button color="link" onClick={this.toggleReferenceKeyModal.bind(this)}
                                    title={'Show/edit entity identifier'}
                                    className="btn-circle circle-button-svg-container mx-1">
                                <svg width="1em" height="1em" viewBox="0 0 16 16"
                                     className={'bi bi-key-fill text-secondary'}
                                     fill={'currentColor'}
                                     xmlns="http://www.w3.org/2000/svg">
                                    <path fillRule="evenodd"
                                          d="M3.5 11.5a3.5 3.5 0 1 1 3.163-5H14L15.5 8 14 9.5l-1-1-1 1-1-1-1 1-1-1-1 1H6.663a3.5 3.5 0 0 1-3.163 2zM2.5 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
                                </svg>
                            </Button>
                            <Modal isOpen={this.state.referenceKeyModal}
                                   toggle={this.toggleReferenceKeyModal.bind(this)}
                                   className={'w-75 mw-100'}>
                                <ModalHeader
                                    toggle={this.toggleReferenceKeyModal.bind(this)}>{`Identifier for '${this.props.idIndexedSchema[this.props.entity]}'`}
                                </ModalHeader>
                                <ModalBody>
                                    <Row>
                                        <Col md='12' style={{ 'textAlign': 'center' }}>
                                            <h5>Identifier for {this.props.idIndexedSchema[this.props.entity]}
                                                <FontAwesomeIcon
                                                    style={{ color: '#17a2b8' }}
                                                    icon="question-circle"
                                                    title="Entities are presented with this attribute in the results" />
                                            </h5>
                                            <Input id="select-field-dropdown" type="select"
                                                   value={this.state.selectField}
                                                   onChange={this.props.handleSelectFieldChange}>
                                                {this.props.selectFieldOptions}
                                            </Input>
                                        </Col>
                                    </Row>
                                </ModalBody>
                                <ModalFooter>
                                    <Button color={'info'}
                                            onClick={this.toggleReferenceKeyModal.bind(this)}><FontAwesomeIcon
                                        icon={'save'} /> Save</Button>
                                </ModalFooter>
                            </Modal>
                        </div>
                    }
                    {
                        this.props.constraints && this.props.datasetFolder &&
                        <div className={'d-inline-block'}>
                            <Button color="link" onClick={this.toggleConstraintsModal.bind(this)}
                                    className="btn-circle circle-button-svg-container mx-1"
                                    title={'Show/edit entity filters'}>
                                <svg width="1em" height="1em" viewBox="0 0 16 16"
                                     className={this.numberOfConstraints() === 0 ? 'bi bi-funnel-fill unset' : 'bi bi-funnel-fill text-secondary'}
                                     fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                    <path fillRule="evenodd"
                                          d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5v-2z" />
                                </svg>
                            </Button>
                            <Modal isOpen={this.state.constraintsModal} toggle={this.toggleConstraintsModal.bind(this)}
                                   className={'w-75 mw-100'}>
                                <ModalBody>
                                    <ConstraintItem
                                        key={this.props.idIndexedSchema[this.props.entity]}
                                        datasetFolder={this.props.datasetFolder}
                                        entity={this.props.idIndexedSchema[this.props.entity]}
                                        entityConstraints={this.props.constraints}
                                        handleSwitch={this.props.handleSwitch}
                                        handleDropdown={this.props.handleDropdown}
                                        handleLogicDropdown={this.props.handleLogicDropdown}
                                        handleInput={this.props.handleInput}
                                        handleAddition={this.props.handleAddition}
                                        handleRemoval={this.props.handleRemoval}
                                        handleMultipleAddition={this.props.handleMultipleAddition}
                                    />
                                </ModalBody>
                                <ModalFooter>
                                    <Col xs={'8'}>
                                        <em className={'text-muted'}>
                                            <span className={'font-weight-bold'}>
                                            {
                                                this.numberOfConstraints() > 0
                                                    ? ((this.numberOfConstraints() > 1
                                                    ? `${this.numberOfConstraints()} constraints`
                                                    : '1 constraint') + ' having ' + (this.numberOfConditions() > 1 ? `${this.numberOfConditions()} conditions`
                                                    : '1 condition')) : 'No constraints have been selected'}
                                            </span>
                                            <br />
                                            {this.constraintSummary()}

                                        </em>
                                    </Col>
                                    <Col xs={'4'} className={'text-right'}>
                                        <Button color={'info'}
                                                onClick={this.toggleConstraintsModal.bind(this)}><FontAwesomeIcon
                                            icon={'save'} /> Save</Button>
                                    </Col>
                                </ModalFooter>
                            </Modal>
                        </div>
                    }
                    {this.numberOfConditions() > 0 &&
                    <div title={this.constraintSummary()}
                         className={'d-inline-block text-muted constraints-number'}>{`(${this.numberOfConditions()})`}</div>
                    }
                </div>
            </div>
        );
    }
}

export default EntityBox;
